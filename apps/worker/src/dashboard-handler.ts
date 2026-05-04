import type { ExecutionContext } from "@cloudflare/workers-types";
import { createParleyAuth, filterGuildsByPermissions, readDashboardSession } from "@parley/auth";
import { hasBotInGuild, getGuildDashboardData, getGuildMatchHistory } from "@parley/db/dashboard";
import { guildLimits, guildSettings } from "@parley/db/schema";
import { createRuntimeDbHandle, ManagedExecutionContext } from "./runtime-db";
import type { WorkerEnv } from "./env";

function unauthorizedResponse(): Response {
  return Response.json({ error: "unauthorized" }, { status: 401 });
}

function forbiddenResponse(): Response {
  return Response.json({ error: "forbidden" }, { status: 403 });
}

function notFoundResponse(): Response {
  return Response.json({ error: "not_found" }, { status: 404 });
}

export async function handleDashboardGuilds(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const handle = await createRuntimeDbHandle(env);
  if (!handle.env.db) {
    await handle.close();
    return Response.json({ error: "database_unavailable" }, { status: 503 });
  }

  const managedContext = new ManagedExecutionContext(ctx, handle.close);

  try {
    const auth = createParleyAuth(handle.env.db, handle.env);
    const session = await readDashboardSession(auth, handle.env.db, request.headers);

    if (!session) {
      return unauthorizedResponse();
    }

    const adminGuilds = filterGuildsByPermissions(session.guilds);

    const guildsWithBotStatus = await Promise.all(
      adminGuilds.map(async (guild) => {
        const botPresent = await hasBotInGuild(handle.env.db, guild.id);
        return {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          permissions: guild.permissions,
          botPresent,
        };
      }),
    );

    const guildsWithBotPresent = guildsWithBotStatus.filter((g) => g.botPresent);

    return Response.json({ guilds: guildsWithBotPresent });
  } finally {
    managedContext.markResponseReturned();
  }
}

export async function handleDashboardGuildDetail(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
  guildId: string,
): Promise<Response> {
  if (request.method !== "GET" && request.method !== "PUT") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const handle = await createRuntimeDbHandle(env);
  if (!handle.env.db) {
    await handle.close();
    return Response.json({ error: "database_unavailable" }, { status: 503 });
  }

  const managedContext = new ManagedExecutionContext(ctx, handle.close);

  try {
    const auth = createParleyAuth(handle.env.db, handle.env);
    const session = await readDashboardSession(auth, handle.env.db, request.headers);

    if (!session) {
      return unauthorizedResponse();
    }

    const adminGuilds = filterGuildsByPermissions(session.guilds);
    const guild = adminGuilds.find((g) => g.id === guildId);
    if (!guild) {
      return forbiddenResponse();
    }

    const botPresent = await hasBotInGuild(handle.env.db, guildId);
    if (!botPresent) {
      return notFoundResponse();
    }

    if (request.method === "GET") {
      const data = await getGuildDashboardData(handle.env.db, guildId);
      return Response.json({
        guild: {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
        },
        settings: data?.settings ?? null,
        limits: data?.limits ?? null,
        stats: data?.stats ?? { playerCount: 0, matchCount: 0, tournamentCount: 0 },
      });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const { defaultTeamFormat, autoBalance, crossGuildMatchmaking, dailyMatchLimit } = body;

    const db = handle.env.db;
    const now = Date.now();
    const updatedBy = session.discordUserId;

    if (
      defaultTeamFormat !== undefined ||
      autoBalance !== undefined ||
      crossGuildMatchmaking !== undefined
    ) {
      await db
        .insert(guildSettings)
        .values({
          guildId,
          defaultTeamFormat: typeof defaultTeamFormat === "string" ? defaultTeamFormat : null,
          autoBalance: typeof autoBalance === "boolean" ? autoBalance : true,
          crossGuildMatchmaking:
            typeof crossGuildMatchmaking === "boolean" ? crossGuildMatchmaking : true,
          updatedAt: now,
          updatedByDiscordUserId: updatedBy,
        })
        .onConflictDoUpdate({
          target: guildSettings.guildId,
          set: {
            ...(typeof defaultTeamFormat === "string" ? { defaultTeamFormat } : {}),
            ...(typeof autoBalance === "boolean" ? { autoBalance } : {}),
            ...(typeof crossGuildMatchmaking === "boolean" ? { crossGuildMatchmaking } : {}),
            updatedAt: now,
            updatedByDiscordUserId: updatedBy,
          },
        });
    }

    if (typeof dailyMatchLimit === "number") {
      await db
        .insert(guildLimits)
        .values({
          guildId,
          dailyMatchLimit,
          updatedByDiscordUserId: updatedBy,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: guildLimits.guildId,
          set: {
            dailyMatchLimit,
            updatedByDiscordUserId: updatedBy,
            updatedAt: now,
          },
        });
    }

    const data = await getGuildDashboardData(handle.env.db, guildId);
    return Response.json({
      guild: {
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
      },
      settings: data?.settings ?? null,
      limits: data?.limits ?? null,
      stats: data?.stats ?? { playerCount: 0, matchCount: 0, tournamentCount: 0 },
    });
  } finally {
    managedContext.markResponseReturned();
  }
}

export async function handleDashboardGuildHistory(
  request: Request,
  env: WorkerEnv,
  ctx: ExecutionContext,
  guildId: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const handle = await createRuntimeDbHandle(env);
  if (!handle.env.db) {
    await handle.close();
    return Response.json({ error: "database_unavailable" }, { status: 503 });
  }

  const managedContext = new ManagedExecutionContext(ctx, handle.close);

  try {
    const auth = createParleyAuth(handle.env.db, handle.env);
    const session = await readDashboardSession(auth, handle.env.db, request.headers);

    if (!session) {
      return unauthorizedResponse();
    }

    const adminGuilds = filterGuildsByPermissions(session.guilds);
    const guild = adminGuilds.find((g) => g.id === guildId);
    if (!guild) {
      return forbiddenResponse();
    }

    const botPresent = await hasBotInGuild(handle.env.db, guildId);
    if (!botPresent) {
      return notFoundResponse();
    }

    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "20", 10)),
    );

    const { matches, total } = await getGuildMatchHistory(handle.env.db, guildId, page, pageSize);
    const totalPages = Math.ceil(total / pageSize);

    return Response.json({
      matches,
      page,
      pageSize,
      total,
      totalPages,
    });
  } finally {
    managedContext.markResponseReturned();
  }
}
