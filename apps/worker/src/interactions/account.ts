import type { WorkerRuntimeEnv } from "../env";
import {
  resolveApplicationEmojiCatalog,
  SlashCommand,
  type AppEmojiName,
  type ApplicationEmojiCatalog,
} from "@parley/discord-runtime";
import {
  getAccountLinkByDiscordUserId,
  linkDiscordAccount,
  unlinkGuildRegistration,
} from "@parley/db/account-links";
import { deleteGuildRosterCaches } from "@parley/core/guild-roster-cache";
import { getOrBuildGuildRoster } from "@parley/core/guild-roster-service";
import { persistStatsSnapshot } from "@parley/core/stats-snapshot";
import {
  reconcileAutoPlayerRegistrations,
  resolveStatsEnvelopePlayerId,
  upsertRegistrationPlayer,
} from "@parley/core/player-identity";
import {
  getInternalPlayerSummaryByPlayerId,
  isExternalStatsRefreshLocked,
} from "@parley/core/player-ratings";
import { buildStatsCacheKey, readStatsCache } from "@parley/core/stats-cache";
import {
  consumeExecutorDailyQuota,
  formatDiscordRetryAt,
  isBotOwner,
  nextUtcDayUnix,
} from "@parley/core/stats-rate-limit";
import {
  createStatsRefreshMessage,
  enqueueStatsRefresh,
  type StatsRefreshEnv,
} from "../queues/stats-refresh";
import { mergeInteractionAnalyticsContext } from "../analytics";
import { enforceCommandCooldown } from "./command-cooldowns";
import { buildComponentsV2Reply, buildNoticeCard } from "./ui";

type AccountEnv = Partial<WorkerRuntimeEnv> & StatsRefreshEnv;
type RegistrationPlatform = "auto" | "pc" | "playstation" | "xbox";

function parsePlatform(value: string | null): RegistrationPlatform {
  if (value === "pc" || value === "playstation" || value === "xbox") {
    return value;
  }
  return "auto";
}

function toAnalyticsRefreshState(status: string): string {
  return status.replaceAll("-", "_");
}

function buildExecutorLimitMessage(retryAtUnix: number): string {
  return `You've reached the /account refresh cap (3 requests per day).\nRetry at ${formatDiscordRetryAt(retryAtUnix)}.`;
}

function buildLockedExternalStatsMessage(): string {
  return "External stats refresh is disabled for this player after 10 recorded internal matches.";
}

async function resolveAccountEmojiCatalog(
  env: AccountEnv,
  applicationId: string,
): Promise<ApplicationEmojiCatalog> {
  return resolveApplicationEmojiCatalog({
    applicationId,
    botToken: env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN,
    cache: env.Cache,
  });
}

function buildAccountReply(input: {
  title: string;
  message: string;
  tone: "danger" | "info" | "primary" | "success" | "warning";
  emojiName: AppEmojiName;
  emojis?: ApplicationEmojiCatalog | null;
  details?: string[];
}) {
  return buildComponentsV2Reply([
    buildNoticeCard({
      title: input.title,
      message: input.message,
      tone: input.tone,
      emojiName: input.emojiName,
      emojis: input.emojis,
      details: input.details,
    }),
  ]);
}

async function ensureGuildOnly(
  interaction: Parameters<Parameters<typeof accountCommand.addHandler>[0]>[0],
) {
  if (interaction.guildId && interaction.channelId && interaction.userId) {
    return true;
  }

  const env = interaction.context.env as AccountEnv;
  const emojis = await resolveAccountEmojiCatalog(env, interaction.applicationId);
  await interaction.reply(
    buildAccountReply({
      title: "Server only",
      message: "This command only works in a server.",
      tone: "warning",
      emojiName: "warning",
      emojis,
    }),
    true,
  );
  return false;
}

async function persistCachedEnvelope(
  env: AccountEnv,
  cachedEnvelope: NonNullable<Awaited<ReturnType<typeof readStatsCache>>>,
): Promise<number | null> {
  await persistStatsSnapshot(env.db, {
    profile: cachedEnvelope.profile,
    rankedStats: cachedEnvelope.rankedStats,
    calculatedMetrics: cachedEnvelope.calculatedMetrics,
    cacheVersion: cachedEnvelope.version,
    fetchedAt: cachedEnvelope.cachedAt,
    source: "live",
  });

  await reconcileAutoPlayerRegistrations(env.db, cachedEnvelope);
  return resolveStatsEnvelopePlayerId(env.db, cachedEnvelope);
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
    const emojis = await resolveAccountEmojiCatalog(env, interaction.applicationId);
    const commandKey =
      subcommand === "register"
        ? "account.register"
        : subcommand === "unregister"
          ? "account.unregister"
          : subcommand === "refresh"
            ? "account.refresh"
            : "account.me";
    mergeInteractionAnalyticsContext(interaction.context, {
      cacheState: "none",
      extraState: "none",
    });
    const cooldown = await enforceCommandCooldown(env, {
      commandKey,
      userId,
    });
    if (!cooldown.allowed) {
      await interaction.reply(cooldown.payload, true);
      return;
    }

    if (subcommand === "register") {
      const username = interaction.options.getString("username", true)!.trim();
      const platform = parsePlatform(interaction.options.getString("platform", false));

      await interaction.deferReply(true);

      if (!env.db) {
        await interaction.editReply(
          buildAccountReply({
            title: "Configuration error",
            message: "Database connection is unavailable.",
            tone: "danger",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      const cachedEnvelope = await readStatsCache(
        env.Cache,
        buildStatsCacheKey(username, platform, "latest"),
      );
      mergeInteractionAnalyticsContext(interaction.context, {
        cacheState: cachedEnvelope ? "hit" : "miss",
      });

      let playerId: number;
      if (cachedEnvelope) {
        playerId =
          (await persistCachedEnvelope(env, cachedEnvelope)) ??
          (await upsertRegistrationPlayer(env.db, {
            username,
            platform:
              typeof cachedEnvelope.profile.platform === "string"
                ? cachedEnvelope.profile.platform
                : platform,
          }));
      } else {
        playerId = await upsertRegistrationPlayer(env.db, { username, platform });
      }

      try {
        const linkResult = await linkDiscordAccount(env.db, {
          guildId,
          discordUserId: userId,
          playerId,
        });
        await deleteGuildRosterCaches(env.Cache, linkResult.linkedGuildIds);
      } catch (error) {
        await interaction.editReply(
          buildAccountReply({
            title: "Registration failed",
            message: error instanceof Error ? error.message : "Failed to link this R6 account.",
            tone: "danger",
            emojiName: "cancel",
            emojis,
          }),
        );
        return;
      }

      if (cachedEnvelope) {
        await interaction.editReply(
          buildAccountReply({
            title: "Account registered",
            message: `Registered **${username}** for this server.`,
            tone: "success",
            emojiName: "confirm",
            emojis,
            details: [
              `**Platform**\n${platform}`,
              "**Status**\nReady for `/team create` now.",
              "**Next Step**\nUse `/team create` when your lobby is ready.",
            ],
          }),
        );
        return;
      }

      const playerSummary = await getInternalPlayerSummaryByPlayerId(env.db, playerId);
      if (isExternalStatsRefreshLocked(playerSummary)) {
        await interaction.editReply(
          buildAccountReply({
            title: "Account registered",
            message: `Registered **${username}** for this server.`,
            tone: "success",
            emojiName: "confirm",
            emojis,
            details: [
              `**Platform**\n${platform}`,
              `**Refresh Status**\n${buildLockedExternalStatsMessage()}`,
              "**Next Step**\nYour internal ELO is already ready for `/team create`.",
            ],
          }),
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
        mergeInteractionAnalyticsContext(interaction.context, {
          extraState: "queue_error",
        });
        await interaction.editReply(
          buildAccountReply({
            title: "Account registered",
            message: `Registered **${username}** for this server, but I couldn't queue the initial stats refresh right now.`,
            tone: "warning",
            emojiName: "warning",
            emojis,
            details: [
              `**Platform**\n${platform}`,
              "**Status**\nPending stats refresh.",
              "**Next Step**\nTry `/account refresh` again later.",
            ],
          }),
        );
        return;
      }

      if (enqueueResult.value.status === "daily-capped") {
        mergeInteractionAnalyticsContext(interaction.context, {
          extraState: "daily_capped",
        });
        await interaction.editReply(
          buildAccountReply({
            title: "Account registered",
            message: `Registered **${username}** for this server.`,
            tone: "warning",
            emojiName: "timer",
            emojis,
            details: [
              `**Platform**\n${platform}`,
              "**Status**\nPending because stat refresh is capped for today.",
              `**Retry**\n${formatDiscordRetryAt(nextUtcDayUnix())}`,
            ],
          }),
        );
        return;
      }

      mergeInteractionAnalyticsContext(interaction.context, {
        extraState: toAnalyticsRefreshState(enqueueResult.value.status),
      });
      await interaction.editReply(
        buildAccountReply({
          title: "Account registered",
          message: `Registered **${username}** for this server.`,
          tone: "info",
          emojiName: "timer",
          emojis,
          details: [
            `**Platform**\n${platform}`,
            "**Status**\nPending until the queued R6 stats refresh completes.",
            "**Next Step**\nThis server entry will become ready automatically after sync.",
          ],
        }),
      );
      return;
    }

    if (subcommand === "unregister") {
      await interaction.deferReply(true);

      if (!env.db) {
        await interaction.editReply(
          buildAccountReply({
            title: "Configuration error",
            message: "Database connection is unavailable.",
            tone: "danger",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      const result = await unlinkGuildRegistration(env.db, {
        guildId,
        discordUserId: userId,
      });

      if (result.removedPlayerId === null) {
        await interaction.editReply(
          buildAccountReply({
            title: "Nothing to remove",
            message: "You are not registered in this server.",
            tone: "warning",
            emojiName: "question_mark",
            emojis,
          }),
        );
        return;
      }

      await deleteGuildRosterCaches(env.Cache, [guildId]);
      await interaction.editReply(
        buildAccountReply({
          title: "Registration removed",
          message: "Removed your registration from this server.",
          tone: "success",
          emojiName: "confirm",
          emojis,
        }),
      );
      return;
    }

    if (subcommand === "me") {
      await interaction.deferReply(true);

      const account = await getAccountLinkByDiscordUserId(env.db, userId);
      const roster = await getOrBuildGuildRoster(env.Cache, env.db, guildId);
      const guildRegistration = roster.find((member) => member.discordUserId === userId) ?? null;

      if (!account && !guildRegistration) {
        await interaction.editReply(
          buildAccountReply({
            title: "No linked account",
            message: "You do not have a linked R6 account yet.",
            tone: "warning",
            emojiName: "question_mark",
            emojis,
            details: ["**Next Step**\nUse `/account register` to link your account."],
          }),
        );
        return;
      }

      const lines = [
        `Global account: ${
          account ? `**${account.username}** on **${account.platform}**` : "Not linked"
        }`,
        `Registered in this server: ${guildRegistration ? "Yes" : "No"}`,
      ];

      const accountSummary = account
        ? await getInternalPlayerSummaryByPlayerId(env.db, account.playerId)
        : null;
      const guildSummary = guildRegistration
        ? {
            playerId: guildRegistration.playerId,
            username: guildRegistration.username,
            platform: guildRegistration.platform,
            internalElo: guildRegistration.internalElo,
            internalMatches: guildRegistration.internalMatches,
            internalWins: guildRegistration.internalWins,
            internalLosses: guildRegistration.internalLosses,
            internalUpdatedAt: guildRegistration.internalUpdatedAt,
          }
        : null;
      const internalSummary =
        guildSummary && (accountSummary === null || accountSummary.internalMatches === 0)
          ? guildSummary
          : accountSummary;

      if (internalSummary) {
        lines.push(
          `Internal ELO: **${Math.round(internalSummary.internalElo)}**`,
          `Internal record: **${internalSummary.internalWins}-${internalSummary.internalLosses}**`,
          `Recorded internal matches: **${internalSummary.internalMatches}**`,
        );
      }

      if (guildRegistration) {
        lines.push(
          `Status: ${guildRegistration.ready ? "Ready" : "Pending stats refresh"}`,
          `Eligible for /team create: ${guildRegistration.ready ? "Yes" : "No"}`,
        );
      }

      await interaction.editReply(
        buildAccountReply({
          title: "Account summary",
          message: "Current link, rating, and server readiness.",
          tone: "primary",
          emojiName: "home",
          emojis,
          details: lines.map((line) => {
            const [label, ...rest] = line.split(": ");
            return rest.length > 0 ? `**${label}**\n${rest.join(": ")}` : `**Details**\n${line}`;
          }),
        }),
      );
      return;
    }

    if (subcommand === "refresh") {
      await interaction.deferReply(true);

      const account = await getAccountLinkByDiscordUserId(env.db, userId);
      if (!account) {
        await interaction.editReply(
          buildAccountReply({
            title: "No linked account",
            message: "You do not have a linked R6 account yet.",
            tone: "warning",
            emojiName: "question_mark",
            emojis,
            details: ["**Next Step**\nUse `/account register` to link your account."],
          }),
        );
        return;
      }

      const playerSummary = await getInternalPlayerSummaryByPlayerId(env.db, account.playerId);
      if (isExternalStatsRefreshLocked(playerSummary)) {
        await interaction.editReply(
          buildAccountReply({
            title: "Refresh unavailable",
            message: buildLockedExternalStatsMessage(),
            tone: "warning",
            emojiName: "warning",
            emojis,
            details: [`**Account**\n${account.username} (${account.platform})`],
          }),
        );
        return;
      }

      if (!isBotOwner(userId, env.DISCORD_BOT_OWNER_ID)) {
        const quota = await consumeExecutorDailyQuota(env.Cache, userId);
        if (quota.isLimited) {
          mergeInteractionAnalyticsContext(interaction.context, {
            extraState: "daily_capped",
          });
          await interaction.editReply(
            buildAccountReply({
              title: "Refresh capped",
              message: buildExecutorLimitMessage(quota.retryAtUnix),
              tone: "warning",
              emojiName: "timer",
              emojis,
              details: [`**Account**\n${account.username} (${account.platform})`],
            }),
          );
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
        mergeInteractionAnalyticsContext(interaction.context, {
          extraState: "queue_error",
        });
        await interaction.editReply(
          buildAccountReply({
            title: "Refresh queue failed",
            message: "I couldn't queue a refresh right now.",
            tone: "danger",
            emojiName: "cancel",
            emojis,
            details: [`**Account**\n${account.username} (${account.platform})`],
          }),
        );
        return;
      }

      if (enqueueResult.value.status === "daily-capped") {
        mergeInteractionAnalyticsContext(interaction.context, {
          extraState: "daily_capped",
        });
        await interaction.editReply(
          buildAccountReply({
            title: "Refresh capped",
            message: "Refresh is capped for this tracked player today.",
            tone: "warning",
            emojiName: "timer",
            emojis,
            details: [
              `**Account**\n${account.username} (${account.platform})`,
              `**Retry**\n${formatDiscordRetryAt(nextUtcDayUnix())}`,
            ],
          }),
        );
        return;
      }

      mergeInteractionAnalyticsContext(interaction.context, {
        extraState: toAnalyticsRefreshState(enqueueResult.value.status),
      });
      await interaction.editReply(
        buildAccountReply({
          title:
            enqueueResult.value.status === "deduped" ? "Refresh already queued" : "Refresh queued",
          message:
            enqueueResult.value.status === "deduped"
              ? "A refresh for this account is already queued."
              : "Queued a fresh R6 stats sync for your account.",
          tone: enqueueResult.value.status === "deduped" ? "info" : "success",
          emojiName: enqueueResult.value.status === "deduped" ? "information" : "timer",
          emojis,
          details: [`**Account**\n${account.username} (${account.platform})`],
        }),
      );
    }
  });
