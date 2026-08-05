import type { OAuthEnvSource } from "../discord/env.js";
import type { EngineEnvSource } from "../engine/env.js";
import { engineEnvFromCloudflare } from "../engine/env.js";
import { requireDashboardSession, sessionCanManageGuild } from "../dashboard/auth.js";
import { verifyTournamentHandoff } from "./handoff.js";
import { rpcCreateTournament } from "./rpc.js";

export type TournamentEnvSource = OAuthEnvSource &
  EngineEnvSource & {
    TOURNAMENT_HANDOFF_SECRET?: string;
  };

type CreateTournamentBody = {
  handoff: string;
  name: string;
  format: string;
  teamCap: number;
  rulesText: string;
};

function parseBody(value: unknown): CreateTournamentBody | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const body = value as Record<string, unknown>;
  if (
    typeof body.handoff !== "string" ||
    typeof body.name !== "string" ||
    typeof body.format !== "string" ||
    typeof body.teamCap !== "number" ||
    !Number.isInteger(body.teamCap) ||
    typeof body.rulesText !== "string"
  ) {
    return null;
  }
  const name = body.name.trim();
  const format = body.format.trim();
  if (!name || name.length > 120 || !format || body.teamCap < 2 || body.teamCap > 64) {
    return null;
  }
  return {
    handoff: body.handoff,
    name,
    format,
    teamCap: body.teamCap,
    rulesText: body.rulesText.trim(),
  };
}

/** Creates a tournament only for the user and host guild encoded in the signed Discord handoff. */
export async function handleCreateTournament(
  request: Request,
  env: TournamentEnvSource,
): Promise<Response> {
  const auth = await requireDashboardSession(request, env);
  if (auth instanceof Response) {
    return auth;
  }
  if (!env.TOURNAMENT_HANDOFF_SECRET) {
    return Response.json({ error: "Tournament creation is not configured" }, { status: 503 });
  }
  let body: CreateTournamentBody | null;
  try {
    body = parseBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) {
    return Response.json({ error: "Invalid tournament details" }, { status: 400 });
  }
  const handoff = await verifyTournamentHandoff(body.handoff, env.TOURNAMENT_HANDOFF_SECRET);
  if (!handoff || handoff.userId !== auth.session.user.id) {
    return Response.json(
      { error: "This tournament setup link is invalid or has expired" },
      { status: 403 },
    );
  }
  if (!(await sessionCanManageGuild(auth.session, handoff.guildId))) {
    return Response.json(
      { error: "You no longer have permission to manage this host server" },
      { status: 403 },
    );
  }
  try {
    const tournament = await rpcCreateTournament(
      engineEnvFromCloudflare(env),
      {
        guildId: handoff.guildId,
        channelId: handoff.channelId,
        createdByDiscordUserId: auth.session.user.id,
        game: 1,
        name: body.name,
        format: body.format,
        teamCap: body.teamCap,
        rulesText: body.rulesText,
      },
      auth.session.user.id,
    );
    return Response.json({ tournament }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tournament creation failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
