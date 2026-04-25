import { SlashCommand } from "../lib/discord";
import {
  getAccountLinkByDiscordUserId,
  linkDiscordAccount,
  unlinkGuildRegistration,
} from "../lib/db/account-links";
import { deleteGuildRosterCaches } from "../lib/guild-roster-cache";
import { getOrBuildGuildRoster } from "../lib/guild-roster-service";
import { persistStatsSnapshot } from "../lib/db/stats-snapshot";
import {
  reconcileAutoPlayerRegistrations,
  resolveStatsEnvelopePlayerId,
  upsertRegistrationPlayer,
} from "../lib/db/player-identity";
import { buildStatsCacheKey, readStatsCache } from "../lib/stats-cache";
import {
  consumeExecutorDailyQuota,
  formatDiscordRetryAt,
  isBotOwner,
  nextUtcDayUnix,
} from "../lib/stats-rate-limit";
import {
  createStatsRefreshMessage,
  enqueueStatsRefresh,
  type StatsRefreshEnv,
} from "../queues/stats-refresh";

type AccountEnv = Partial<Env> & StatsRefreshEnv;
type RegistrationPlatform = "auto" | "pc" | "playstation" | "xbox";

function parsePlatform(value: string | null): RegistrationPlatform {
  if (value === "pc" || value === "playstation" || value === "xbox") {
    return value;
  }
  return "auto";
}

function buildExecutorLimitMessage(retryAtUnix: number): string {
  return `You've reached the /account refresh cap (3 requests per day).\nRetry at ${formatDiscordRetryAt(retryAtUnix)}.`;
}

async function ensureGuildOnly(
  interaction: Parameters<Parameters<typeof accountCommand.addHandler>[0]>[0],
) {
  if (interaction.guildId && interaction.channelId && interaction.userId) {
    return true;
  }

  await interaction.reply("This command only works in a server.", true);
  return false;
}

async function persistCachedEnvelope(
  env: AccountEnv,
  cachedEnvelope: NonNullable<Awaited<ReturnType<typeof readStatsCache>>>,
): Promise<number | null> {
  await persistStatsSnapshot(env.Database, {
    profile: cachedEnvelope.profile,
    rankedStats: cachedEnvelope.rankedStats,
    calculatedMetrics: cachedEnvelope.calculatedMetrics,
    cacheVersion: cachedEnvelope.version,
    fetchedAt: cachedEnvelope.cachedAt,
    source: "live",
  });

  await reconcileAutoPlayerRegistrations(env.Database, cachedEnvelope);
  return resolveStatsEnvelopePlayerId(env.Database, cachedEnvelope);
}

export const accountCommand = new SlashCommand()
  .setName("account")
  .setDescription("Register and inspect your Rainbow Six account")
  .addSubcommand((option) =>
    option
      .setName("register")
      .setDescription("Register your R6 account for this server")
      .addStringOption((stringOption) =>
        stringOption
          .setName("username")
          .setDescription("Exact in-game username")
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(64),
      )
      .addStringOption((stringOption) =>
        stringOption
          .setName("platform")
          .setDescription("Platform to register")
          .setRequired(false)
          .addChoices(
            { name: "Auto", value: "auto" },
            { name: "PC", value: "pc" },
            { name: "Xbox", value: "xbox" },
            { name: "PlayStation", value: "playstation" },
          ),
      ),
  )
  .addSubcommand((option) =>
    option.setName("unregister").setDescription("Remove your registration from this server"),
  )
  .addSubcommand((option) =>
    option.setName("me").setDescription("Show your linked R6 account and this server status"),
  )
  .addSubcommand((option) =>
    option.setName("refresh").setDescription("Queue a fresh stats sync for your linked account"),
  )
  .addHandler(async (interaction) => {
    if (!(await ensureGuildOnly(interaction))) {
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    const env = interaction.context.env as AccountEnv;
    const guildId = interaction.guildId!;
    const channelId = interaction.channelId!;
    const userId = interaction.userId!;

    if (subcommand === "register") {
      const username = interaction.options.getString("username", true)!.trim();
      const platform = parsePlatform(interaction.options.getString("platform", false));

      await interaction.deferReply(true);

      if (!env.Database) {
        await interaction.editReply("Database binding is missing.");
        return;
      }

      const cachedEnvelope = await readStatsCache(
        env.Cache,
        buildStatsCacheKey(username, platform, "latest"),
      );

      let playerId: number;
      if (cachedEnvelope) {
        playerId =
          (await persistCachedEnvelope(env, cachedEnvelope)) ??
          (await upsertRegistrationPlayer(env.Database, {
            username,
            platform:
              typeof cachedEnvelope.profile.platform === "string"
                ? cachedEnvelope.profile.platform
                : platform,
          }));
      } else {
        playerId = await upsertRegistrationPlayer(env.Database, { username, platform });
      }

      try {
        const linkResult = await linkDiscordAccount(env.Database, {
          guildId,
          discordUserId: userId,
          playerId,
        });
        await deleteGuildRosterCaches(env.Cache, linkResult.linkedGuildIds);
      } catch (error) {
        await interaction.editReply(
          error instanceof Error ? error.message : "Failed to link this R6 account.",
        );
        return;
      }

      if (cachedEnvelope) {
        await interaction.editReply(
          `Registered **${username}** for this server. Stats were already cached, so you're ready for \`/team create\` now.`,
        );
        return;
      }

      const enqueueResult = await enqueueStatsRefresh(
        env,
        createStatsRefreshMessage({
          username,
          platform,
          reason: "cache-miss",
          guildId,
          channelId,
          userId,
        }),
      );

      if (enqueueResult.isErr()) {
        await interaction.editReply(
          `Registered **${username}** for this server, but I couldn't queue the initial stats refresh right now.`,
        );
        return;
      }

      if (enqueueResult.value.status === "daily-capped") {
        await interaction.editReply(
          `Registered **${username}** for this server. The account is pending because stat refresh is capped for today.`,
        );
        return;
      }

      await interaction.editReply(
        `Registered **${username}** for this server. The account is pending until the queued R6 stats refresh completes.`,
      );
      return;
    }

    if (subcommand === "unregister") {
      await interaction.deferReply(true);

      if (!env.Database) {
        await interaction.editReply("Database binding is missing.");
        return;
      }

      const result = await unlinkGuildRegistration(env.Database, {
        guildId,
        discordUserId: userId,
      });

      if (result.removedPlayerId === null) {
        await interaction.editReply("You are not registered in this server.");
        return;
      }

      await deleteGuildRosterCaches(env.Cache, [guildId]);
      await interaction.editReply("Removed your registration from this server.");
      return;
    }

    if (subcommand === "me") {
      await interaction.deferReply(true);

      const account = await getAccountLinkByDiscordUserId(env.Database, userId);
      const roster = await getOrBuildGuildRoster(env.Cache, env.Database, guildId);
      const guildRegistration = roster.find((member) => member.discordUserId === userId) ?? null;

      if (!account && !guildRegistration) {
        await interaction.editReply(
          "You do not have a linked R6 account yet. Use `/account register`.",
        );
        return;
      }

      const lines = [
        `Global account: ${
          account ? `**${account.username}** on **${account.platform}**` : "Not linked"
        }`,
        `Registered in this server: ${guildRegistration ? "Yes" : "No"}`,
      ];

      if (guildRegistration) {
        if (guildRegistration.ready && guildRegistration.metrics) {
          lines.push(
            `Status: Ready`,
            `Seed score: **${guildRegistration.metrics.seedScore.toFixed(2)}**`,
            `Eligible for /team create: Yes`,
          );
        } else {
          lines.push(`Status: Pending stats refresh`, `Eligible for /team create: No`);
        }
      }

      await interaction.editReply(lines.join("\n"));
      return;
    }

    if (subcommand === "refresh") {
      await interaction.deferReply(true);

      const account = await getAccountLinkByDiscordUserId(env.Database, userId);
      if (!account) {
        await interaction.editReply(
          "You do not have a linked R6 account yet. Use `/account register`.",
        );
        return;
      }

      if (!isBotOwner(userId, env.DISCORD_BOT_OWNER_ID)) {
        const quota = await consumeExecutorDailyQuota(env.Cache, userId);
        if (quota.isLimited) {
          await interaction.editReply(buildExecutorLimitMessage(quota.retryAtUnix));
          return;
        }
      }

      const enqueueResult = await enqueueStatsRefresh(
        env,
        createStatsRefreshMessage({
          username: account.username,
          platform: parsePlatform(account.platform),
          reason: "stale-cache",
          guildId,
          channelId,
          userId,
        }),
      );

      if (enqueueResult.isErr()) {
        await interaction.editReply("I couldn't queue a refresh right now.");
        return;
      }

      if (enqueueResult.value.status === "daily-capped") {
        await interaction.editReply(
          `Refresh is capped for this tracked player today.\nRetry at ${formatDiscordRetryAt(nextUtcDayUnix())}.`,
        );
        return;
      }

      await interaction.editReply(
        enqueueResult.value.status === "deduped"
          ? "A refresh for this account is already queued."
          : "Queued a fresh R6 stats sync for your account.",
      );
    }
  });
