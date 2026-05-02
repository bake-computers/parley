import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentHandler,
  ComponentType,
  resolveApplicationEmojiCatalog,
  SlashCommand,
  toComponentEmoji,
  type ApplicationEmojiCatalog,
} from "@parley/discord-runtime";
import {
  LEADERBOARD_PAGE_SIZE,
  LEADERBOARD_PAGINATION_PREFIX,
  buildLeaderboardPaginationCustomId,
  clampLeaderboardPage,
  compareLeaderboardEntries,
  filterLeaderboardEntries,
  formatLeaderboardPlatformLabel,
  formatLeaderboardRow,
  leaderboardPageCount,
  leaderboardPageOffset,
  normalizeLeaderboardMinMatches,
  normalizeLeaderboardPlatform,
  normalizeLeaderboardScope,
  parseLeaderboardPaginationCustomId,
  toLeaderboardEntryFromRosterMember,
  type LeaderboardEntry,
  type LeaderboardPlatformFilter,
  type LeaderboardScope,
} from "@parley/core/leaderboard-view";
import {
  readLeaderboardViewState,
  writeLeaderboardViewState,
} from "@parley/core/leaderboard-view-state";
import { getOrBuildGuildRoster } from "@parley/core/guild-roster-service";
import { countGlobalLeaderboard, listGlobalLeaderboardPage } from "@parley/db/leaderboard";
import { logger } from "@parley/core/logger";
import type { WorkerRuntimeEnv } from "../env";
import { enforceCommandCooldown } from "./command-cooldowns";
import {
  buildComponentsV2Reply,
  buildNoticeCard,
  EPHEMERAL_COMPONENTS_V2_FLAGS,
  type NoticeTone,
} from "./ui";

type LeaderboardEnv = Partial<WorkerRuntimeEnv>;

interface LeaderboardPage {
  scope: LeaderboardScope;
  platform: LeaderboardPlatformFilter;
  minMatches: number;
  total: number;
  page: number;
  pageCount: number;
  entries: LeaderboardEntry[];
}

async function resolveLeaderboardEmojiCatalog(env: LeaderboardEnv, applicationId: string) {
  return resolveApplicationEmojiCatalog({
    applicationId,
    botToken: env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN,
    cache: env.Cache,
  });
}

function applyButtonEmoji(
  button: ButtonBuilder,
  emoji: ReturnType<typeof toComponentEmoji>,
): ButtonBuilder {
  if (emoji) {
    button.setEmoji(emoji);
  }
  return button;
}

function buildLeaderboardReply(input: {
  title: string;
  message: string;
  tone: NoticeTone;
  emojiName: "warning" | "timer";
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

function resolveLeaderboardFailure(input: {
  error: unknown;
  deferred: boolean;
  emojis?: ApplicationEmojiCatalog | null;
}) {
  logger.error("leaderboard.command_failed", "Leaderboard command failed", {
    error: input.error,
    deferred: input.deferred,
  });

  const relationMissing =
    input.error !== null &&
    typeof input.error === "object" &&
    "cause" in input.error &&
    input.error.cause !== null &&
    typeof input.error.cause === "object" &&
    "code" in input.error.cause &&
    input.error.cause.code === "42P01";

  if (relationMissing) {
    return buildLeaderboardReply({
      title: "Leaderboard unavailable",
      message: "Required database tables are missing in this environment.",
      tone: "danger",
      emojiName: "warning",
      emojis: input.emojis,
      details: ["Run worker DB migrations, then try `/leaderboard` again."],
    });
  }

  return buildLeaderboardReply({
    title: "Leaderboard failed",
    message: "Something went wrong while loading leaderboard data.",
    tone: "danger",
    emojiName: "warning",
    emojis: input.emojis,
  });
}

async function ensureGuildOnly(
  interaction: Parameters<Parameters<typeof leaderboardCommand.addHandler>[0]>[0],
) {
  if (interaction.guildId && interaction.channelId && interaction.userId) {
    return true;
  }

  const env = interaction.context.env as LeaderboardEnv;
  const emojis = await resolveLeaderboardEmojiCatalog(env, interaction.applicationId);
  await interaction.reply(
    buildLeaderboardReply({
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

function buildLeaderboardPaginationRow(
  viewId: string,
  page: number,
  total: number,
  emojis: ApplicationEmojiCatalog | null | undefined,
): ActionRowBuilder<ButtonBuilder> {
  const pageCount = leaderboardPageCount(total);
  const activePage = clampLeaderboardPage(page, total);
  const isFirst = activePage === 0;
  const isLast = activePage >= pageCount - 1;
  const currentLabel = `Page ${activePage + 1}/${pageCount}`;

  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    applyButtonEmoji(
      new ButtonBuilder()
        .setCustomId(buildLeaderboardPaginationCustomId(viewId, 0, "first"))
        .setLabel("First")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(isFirst),
      toComponentEmoji(emojis, "home"),
    ),
    applyButtonEmoji(
      new ButtonBuilder()
        .setCustomId(buildLeaderboardPaginationCustomId(viewId, activePage - 1, "prev"))
        .setLabel("Prev")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isFirst),
      toComponentEmoji(emojis, "minus"),
    ),
    new ButtonBuilder()
      .setCustomId(buildLeaderboardPaginationCustomId(viewId, activePage, "current"))
      .setLabel(currentLabel)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    applyButtonEmoji(
      new ButtonBuilder()
        .setCustomId(buildLeaderboardPaginationCustomId(viewId, activePage + 1, "next"))
        .setLabel("Next")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(isLast),
      toComponentEmoji(emojis, "plus"),
    ),
    new ButtonBuilder()
      .setCustomId(buildLeaderboardPaginationCustomId(viewId, pageCount - 1, "last"))
      .setLabel("Last")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isLast),
  );
}

function buildLeaderboardContent(pageData: LeaderboardPage): string {
  if (pageData.entries.length === 0) {
    return "No players matched these filters.";
  }

  const startRank = pageData.page * LEADERBOARD_PAGE_SIZE + 1;
  return pageData.entries
    .map((entry, index) => formatLeaderboardRow(startRank + index, entry))
    .join("\n");
}

function buildLeaderboardPayload(
  viewId: string,
  pageData: LeaderboardPage,
  emojis: ApplicationEmojiCatalog | null | undefined,
) {
  const scopeLabel = pageData.scope === "global" ? "Global" : "Server";
  const details = [
    `**Filters**\nPlatform: ${formatLeaderboardPlatformLabel(pageData.platform)} • Min Matches: ${pageData.minMatches} • Total: ${pageData.total}`,
    `**Rankings**\n${buildLeaderboardContent(pageData)}`,
  ];

  return buildComponentsV2Reply([
    buildNoticeCard({
      title: `Leaderboard • ${scopeLabel}`,
      message: "Internal ELO rankings",
      tone: "primary",
      emojiName: "strong",
      emojis,
      details,
      actionRows: [buildLeaderboardPaginationRow(viewId, pageData.page, pageData.total, emojis)],
    }),
  ]);
}

async function loadLeaderboardPage(
  env: LeaderboardEnv,
  input: {
    guildId: string;
    scope: LeaderboardScope;
    platform: LeaderboardPlatformFilter;
    minMatches: number;
    page: number;
  },
): Promise<LeaderboardPage> {
  if (input.scope === "server") {
    const roster = await getOrBuildGuildRoster(env.Cache, env.db, input.guildId);
    const filtered = filterLeaderboardEntries(
      roster.map((member) => toLeaderboardEntryFromRosterMember(member)),
      {
        platform: input.platform,
        minMatches: input.minMatches,
      },
    ).sort(compareLeaderboardEntries);

    const total = filtered.length;
    const page = clampLeaderboardPage(input.page, total);
    const offset = leaderboardPageOffset(page, total);
    const entries = filtered.slice(offset, offset + LEADERBOARD_PAGE_SIZE);

    return {
      scope: input.scope,
      platform: input.platform,
      minMatches: input.minMatches,
      total,
      page,
      pageCount: leaderboardPageCount(total),
      entries,
    };
  }

  const total = await countGlobalLeaderboard(env.db, {
    platform: input.platform,
    minMatches: input.minMatches,
  });
  const page = clampLeaderboardPage(input.page, total);
  const offset = leaderboardPageOffset(page, total);
  const entries = await listGlobalLeaderboardPage(env.db, {
    platform: input.platform,
    minMatches: input.minMatches,
    limit: LEADERBOARD_PAGE_SIZE,
    offset,
  });

  return {
    scope: input.scope,
    platform: input.platform,
    minMatches: input.minMatches,
    total,
    page,
    pageCount: leaderboardPageCount(total),
    entries,
  };
}

export const leaderboardCommand = new SlashCommand()
  .setName("leaderboard")
  .setDescription("Show player rankings by internal ELO")
  .addStringOption((option) =>
    option
      .setName("scope")
      .setDescription("Leaderboard scope")
      .setRequired(false)
      .addChoices({ name: "Server", value: "server" }, { name: "Global", value: "global" }),
  )
  .addStringOption((option) =>
    option
      .setName("platform")
      .setDescription("Platform filter")
      .setRequired(false)
      .addChoices(
        { name: "All", value: "all" },
        { name: "PC", value: "pc" },
        { name: "Xbox", value: "xbox" },
        { name: "PlayStation", value: "playstation" },
      ),
  )
  .addIntegerOption((option) =>
    option
      .setName("min_matches")
      .setDescription("Minimum internal matches")
      .setRequired(false)
      .setMinValue(0)
      .setMaxValue(500),
  )
  .addHandler(async (interaction) => {
    if (!(await ensureGuildOnly(interaction))) {
      return;
    }

    const env = interaction.context.env as LeaderboardEnv;
    const cooldown = await enforceCommandCooldown(env, {
      commandKey: "leaderboard",
      userId: interaction.userId,
    });
    if (!cooldown.allowed) {
      await interaction.reply(cooldown.payload, true);
      return;
    }

    const guildId = interaction.guildId!;
    const scope = normalizeLeaderboardScope(interaction.options.getString("scope", false));
    const platform = normalizeLeaderboardPlatform(interaction.options.getString("platform", false));
    const minMatches = normalizeLeaderboardMinMatches(
      interaction.options.getInteger("min_matches", false),
    );
    // Emoji catalog will be loaded after defer to avoid slow startup on timeout-sensitive path
    let emojis: ApplicationEmojiCatalog | null | undefined = undefined;

    if (!env.db) {
      await interaction.reply(
        buildLeaderboardReply({
          title: "Configuration error",
          message: "Database connection is unavailable.",
          tone: "danger",
          emojiName: "warning",
          emojis,
        }),
        true,
      );
      return;
    }

    await interaction.deferReply(true);

    // Now that we've deferred, load emoji catalog
    emojis = await resolveLeaderboardEmojiCatalog(env, interaction.applicationId);

    try {
      const pageData = await loadLeaderboardPage(env, {
        guildId,
        scope,
        platform,
        minMatches,
        page: 0,
      });

      await writeLeaderboardViewState(env.Cache, interaction.id, {
        scope,
        guildId,
        platform,
        minMatches,
      });

      await interaction.editReply(buildLeaderboardPayload(interaction.id, pageData, emojis));
    } catch (error) {
      await interaction.editReply(
        resolveLeaderboardFailure({
          error,
          deferred: true,
          emojis,
        }),
      );
    }
  });

export const leaderboardPaginationHandler = new ComponentHandler(
  LEADERBOARD_PAGINATION_PREFIX,
  ComponentType.Button,
).addHandler(async (interaction) => {
  const parsedCustomId = parseLeaderboardPaginationCustomId(interaction.customId);
  const env = interaction.context.env as LeaderboardEnv;
  const emojis = await resolveLeaderboardEmojiCatalog(env, interaction.applicationId);

  if (!parsedCustomId) {
    await interaction.reply(
      buildLeaderboardReply({
        title: "Leaderboard control expired",
        message: "This leaderboard control is no longer valid.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  const state = await readLeaderboardViewState(env.Cache, parsedCustomId.viewId);
  if (!state) {
    await interaction.reply(
      buildLeaderboardReply({
        title: "Leaderboard view expired",
        message: "This leaderboard view expired. Run `/leaderboard` again.",
        tone: "warning",
        emojiName: "timer",
        emojis,
      }),
      true,
    );
    return;
  }

  if (!env.db) {
    await interaction.reply(
      buildLeaderboardReply({
        title: "Configuration error",
        message: "Database connection is unavailable.",
        tone: "danger",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  try {
    const pageData = await loadLeaderboardPage(env, {
      guildId: state.guildId,
      scope: state.scope,
      platform: state.platform,
      minMatches: state.minMatches,
      page: parsedCustomId.page,
    });

    await interaction.update({
      ...buildLeaderboardPayload(parsedCustomId.viewId, pageData, emojis),
      flags: EPHEMERAL_COMPONENTS_V2_FLAGS,
    });
  } catch (error) {
    await interaction.reply(
      resolveLeaderboardFailure({
        error,
        deferred: false,
        emojis,
      }),
      true,
    );
  }
});
