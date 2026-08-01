import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { env } from "cloudflare:workers";
import { requireDashboardSession, type DashboardSession } from "../dashboard/auth.js";
import { fetchGuildMembers, type GuildMember } from "../discord/bot.js";
import { cacheGetJson, cachePutJson } from "../discord/discord-cache.js";
import { resolveBotToken } from "../discord/env.js";
import { resolveSessionGuilds } from "../discord/oauth.js";
import { engineEnvFromCloudflare } from "../engine/env.js";
import {
  rpcGetTournamentByCode,
  rpcRegisterTeam,
  rpcTournamentAction,
  type TournamentJson,
} from "./rpc.js";

const GUILD_MEMBERS_TTL_SEC = 120;

function validateTournamentCode(code: string): string {
  const normalized = code.trim().toUpperCase();
  // 10 chars since the entropy bump; 6-char legacy codes stay resolvable.
  if (!/^(?:[A-Z2-9]{6}|[A-Z2-9]{10})$/u.test(normalized))
    {throw new Error("Invalid tournament code");}
  return normalized;
}

async function requireSession(): Promise<DashboardSession> {
  const request = getRequest();
  if (!request) {throw new Error("No active request");}
  const auth = await requireDashboardSession(request, env);
  if (auth instanceof Response) {throw new Error("Log in with Discord to continue");}
  return auth.session;
}

async function sessionIsGuildMember(session: DashboardSession, guildId: string): Promise<boolean> {
  const guilds = await resolveSessionGuilds(session);
  return guilds.some((guild) => guild.id === guildId);
}

/** Public tournament view (teams + bracket) by share code. */
export const getTournament = createServerFn({ method: "GET" })
  .inputValidator(validateTournamentCode)
  .handler(
    ({ data: code }): Promise<TournamentJson> =>
      rpcGetTournamentByCode(engineEnvFromCloudflare(env), code),
  );

type TournamentActionInput = {
  code: string;
  action: "register" | "start" | "cancel" | "report";
  teamName?: string;
  discordUserIds?: string[];
  bracketMatchId?: number;
  winnerTeamId?: number;
};

type TournamentActionBody = {
  code: string;
  action: "register" | "start" | "cancel" | "report";
  teamName?: string;
  discordUserIds?: string[];
  bracketMatchId?: number;
  winnerTeamId?: number;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function validateActionInput(input: TournamentActionInput): TournamentActionBody {
  const code = validateTournamentCode(input.code);
  if (input.action === "report") {
    if (!isPositiveInt(input.bracketMatchId) || !isPositiveInt(input.winnerTeamId))
      {throw new Error("Invalid tournament action");}
    return {
      action: "report",
      code,
      bracketMatchId: input.bracketMatchId,
      winnerTeamId: input.winnerTeamId,
    };
  }
  if (input.action === "start" || input.action === "cancel") {return { action: input.action, code };}
  if (input.action !== "register") {throw new Error("Invalid tournament action");}
  const teamName = typeof input.teamName === "string" ? input.teamName.trim() : "";
  const discordUserIds = Array.isArray(input.discordUserIds)
    ? [...new Set(input.discordUserIds.filter((id) => typeof id === "string" && id.trim()))]
    : [];
  if (!teamName || teamName.length > 120 || discordUserIds.length === 0)
    {throw new Error("Invalid tournament action");}
  return { action: "register", code, teamName, discordUserIds };
}

/** Authenticated registration and host-only start/cancel/report. */
export const tournamentAction = createServerFn({ method: "POST" })
  .inputValidator(validateActionInput)
  .handler(async ({ data: body }): Promise<TournamentJson | undefined> => {
    const session = await requireSession();
    const engine = engineEnvFromCloudflare(env);
    const tournament = await rpcGetTournamentByCode(engine, body.code);
    if (body.action === "register") {
      if (!(await sessionIsGuildMember(session, tournament.createdByGuildId)))
        {throw new Error("You must be a member of the host server to register");}
      if (!body.discordUserIds!.includes(session.user.id))
        {throw new Error("Your Discord account must be included in your roster");}
      await rpcRegisterTeam(engine, {
        tournamentId: tournament.id,
        game: 1,
        guildId: tournament.createdByGuildId,
        channelId: tournament.createdByChannelId,
        captainDiscordUserId: session.user.id,
        teamName: body.teamName,
        discordUserIds: body.discordUserIds,
      });
      return undefined;
    }
    if (tournament.createdByDiscordUserId !== session.user.id)
      {throw new Error("Only the tournament host can manage this event");}
    if (body.action === "report") {
      const match = tournament.bracketMatches.find((m) => m.id === body.bracketMatchId);
      if (!match || match.winnerTeamId) {throw new Error("Bracket match is not reportable");}
      if (match.teamAId !== body.winnerTeamId && match.teamBId !== body.winnerTeamId)
        {throw new Error("Winner must be one of the two teams in the match");}
      return rpcTournamentAction(engine, "ReportBracketResult", {
        bracketMatchId: body.bracketMatchId,
        game: 1,
        winnerTeamId: body.winnerTeamId,
        createdByDiscordUserId: session.user.id,
      });
    }
    return rpcTournamentAction(
      engine,
      body.action === "start" ? "StartTournament" : "CancelTournament",
      body.action === "start"
        ? { tournamentId: tournament.id, game: 1, minTeams: tournament.minTeams }
        : { tournamentId: tournament.id, game: 1, cancelledByDiscordUserId: session.user.id },
    );
  });

/** Host-guild member roster for the registration picker (session + guild-member gated). */
export const listTournamentMembers = createServerFn({ method: "POST" })
  .inputValidator(validateTournamentCode)
  .handler(async ({ data: code }): Promise<GuildMember[]> => {
    const session = await requireSession();
    const botToken = resolveBotToken(env);
    if (!botToken) {throw new Error("Member lookup is not configured");}
    const tournament = await rpcGetTournamentByCode(engineEnvFromCloudflare(env), code);
    if (!(await sessionIsGuildMember(session, tournament.createdByGuildId)))
      {throw new Error("You must be a member of the host server to view members");}
    const cacheKey = `guild-members:v1:${tournament.createdByGuildId}`;
    const cached = await cacheGetJson<GuildMember[]>(cacheKey);
    if (cached) {return cached;}
    const members = await fetchGuildMembers(botToken, tournament.createdByGuildId);
    await cachePutJson(cacheKey, members, GUILD_MEMBERS_TTL_SEC);
    return members;
  });
