import type { OAuthEnvSource } from "../discord/env.js";
import type { EngineEnvSource } from "../engine/env.js";
import { engineEnvFromCloudflare } from "../engine/env.js";
import { requireDashboardSession, sessionCanManageGuild } from "../dashboard/auth.js";
import { resolveSessionGuilds } from "../discord/oauth.js";
import { verifyTournamentHandoff } from "./handoff.js";
import {
  rpcCreateTournament,
  rpcGetTournamentByCode,
  rpcRegisterTeam,
  rpcTournamentAction,
} from "./rpc.js";

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

function codeFromUrl(request: Request): string | null {
  const code = new URL(request.url).pathname.split("/").at(-1)?.trim().toUpperCase();
  return code && /^[A-Z2-9]{6}$/u.test(code) ? code : null;
}

async function loadTournament(request: Request, env: TournamentEnvSource) {
  const code = codeFromUrl(request);
  if (!code) throw new Error("Invalid tournament code");
  return rpcGetTournamentByCode(engineEnvFromCloudflare(env), code);
}

export async function handleGetTournament(
  request: Request,
  env: TournamentEnvSource,
): Promise<Response> {
  try {
    return Response.json(
      { tournament: await loadTournament(request, env) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tournament lookup failed";
    return Response.json(
      { error: message },
      { status: message === "Tournament not found" ? 404 : 502 },
    );
  }
}

type TournamentActionBody = {
  action: "register" | "start" | "cancel";
  teamName?: string;
  discordUserIds?: string[];
};

function parseActionBody(value: unknown): TournamentActionBody | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  if (body.action !== "register" && body.action !== "start" && body.action !== "cancel")
    return null;
  if (body.action !== "register") return { action: body.action };
  if (
    typeof body.teamName !== "string" ||
    !Array.isArray(body.discordUserIds) ||
    !body.discordUserIds.every((id) => typeof id === "string" && id.trim())
  )
    return null;
  const discordUserIds = [...new Set(body.discordUserIds.map((id) => id.trim()))];
  return body.teamName.trim() && discordUserIds.length
    ? { action: "register", teamName: body.teamName.trim(), discordUserIds }
    : null;
}

/** Reads public tournament data and performs authenticated registration or host actions. */
export async function handleTournamentAction(
  request: Request,
  env: TournamentEnvSource,
): Promise<Response> {
  const auth = await requireDashboardSession(request, env);
  if (auth instanceof Response) return auth;
  let body: TournamentActionBody | null;
  try {
    body = parseActionBody(await request.json());
  } catch {
    body = null;
  }
  if (!body) return Response.json({ error: "Invalid tournament action" }, { status: 400 });
  try {
    const tournament = await loadTournament(request, env);
    const engine = engineEnvFromCloudflare(env);
    if (body.action === "register") {
      const guilds = await resolveSessionGuilds(auth.session);
      if (!guilds.some((guild) => guild.id === tournament.createdByGuildId)) {
        return Response.json(
          { error: "You must be a member of the host server to register" },
          { status: 403 },
        );
      }
      if (!body.discordUserIds!.includes(auth.session.user.id)) {
        return Response.json(
          { error: "Your Discord account must be included in your roster" },
          { status: 400 },
        );
      }
      await rpcRegisterTeam(engine, {
        tournamentId: tournament.id,
        game: 1,
        guildId: tournament.createdByGuildId,
        channelId: tournament.createdByChannelId,
        captainDiscordUserId: auth.session.user.id,
        teamName: body.teamName,
        discordUserIds: body.discordUserIds,
      });
      return Response.json({ success: true });
    }
    if (tournament.createdByDiscordUserId !== auth.session.user.id) {
      return Response.json(
        { error: "Only the tournament host can manage this event" },
        { status: 403 },
      );
    }
    const updated = await rpcTournamentAction(
      engine,
      body.action === "start" ? "StartTournament" : "CancelTournament",
      body.action === "start"
        ? { tournamentId: tournament.id, game: 1, minTeams: tournament.minTeams }
        : { tournamentId: tournament.id, game: 1, cancelledByDiscordUserId: auth.session.user.id },
    );
    return Response.json({ tournament: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tournament action failed";
    return Response.json({ error: message }, { status: 502 });
  }
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
    const tournament = await rpcCreateTournament(engineEnvFromCloudflare(env), {
      guildId: handoff.guildId,
      channelId: handoff.channelId,
      createdByDiscordUserId: auth.session.user.id,
      game: 1,
      name: body.name,
      format: body.format,
      teamCap: body.teamCap,
      rulesText: body.rulesText,
    });
    return Response.json({ tournament }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tournament creation failed";
    return Response.json({ error: message }, { status: 502 });
  }
}
