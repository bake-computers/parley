import {
  ActionRowBuilder,
  type APISelectMenuDefaultValue,
  type AppEmojiName,
  type ApplicationEmojiCatalog,
  ButtonBuilder,
  ButtonStyle,
  ComponentHandler,
  ComponentType,
  DiscordRestClient,
  type DiscordRuntimeEnv,
  ModalBuilder,
  ModalHandler,
  PermissionFlagsBits,
  resolveApplicationEmojiCatalog,
  SelectMenuDefaultValueType,
  SlashCommand,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  parseCustomId,
  toComponentEmoji,
} from "@parley/discord-runtime";
import {
  listQueuedMatchmakingQueues,
  cancelMatchmakingQueue,
  createMatchmakingQueue,
  expireStaleMatchmakingQueues,
  getActiveMatchmakingQueueForCaptain,
  getActiveMatchmakingQueueForGuild,
  getMatchmakingQueue,
  markMatchmakingQueueMatched,
  type MatchmakingQueuePlayerRecord,
  type MatchmakingQueueWithPlayers,
} from "@parley/db/matchmaking-queues";
import { listGuildIdsForPlayerIds } from "@parley/db/account-links";
import { clearGuildLimit, getGuildLimit, upsertGuildLimit } from "@parley/db/guild-limits";
import { balanceTeams, type TeamCandidate } from "@parley/core/team-balance";
import {
  completeCustomMatch,
  countCompletedMatchesSince,
  createCustomMatch,
  getActiveCrossGuildMatchForGuild,
  getCustomMatch,
  isCustomMatchCaptain,
  updateCustomMatchMessageId,
  type CustomMatchPlayerRecord,
} from "@parley/core/custom-matches";
import { deleteGuildRosterCaches } from "@parley/core/guild-roster-cache";
import { getOrBuildGuildRoster } from "@parley/core/guild-roster-service";
import {
  MATCHMAKING_QUEUE_TTL_MS,
  MATCHMAKING_STACK_SIZE,
  buildMatchmakingQueueSnapshot,
  chooseBestMatchmakingOpponent,
  findReservedMatchmakingPlayerIds,
  toMatchmakingQueuePlayers,
  validateReadyRosterSelection,
} from "@parley/core/team-matchmaking";
import { mergeTeamResults, parsePlayerResultInput } from "@parley/core/team-results";
import {
  deleteTeamDraftState,
  deleteTeamResultSession,
  readTeamDraftState,
  readTeamResultSession,
  writeTeamDraftState,
  writeTeamResultSession,
  type TeamDraftState,
} from "@parley/core/team-state";
import type { WorkerEnv } from "../env";
import { buildComponentsV2Reply, buildNoticeCard, COMPONENTS_V2_FLAGS } from "./ui";

const TEAM_DRAFT_PREFIX = "team-draft";
const TEAM_DRAFT_SELECT_PREFIX = "team-draft-select";
const TEAM_RESULTS_PREFIX = "team-results";
const TEAM_RESULTS_MODAL_PREFIX = "team-results-modal";

type TeamEnv = Partial<WorkerEnv> & Partial<DiscordRuntimeEnv>;
type WinningTeam = "A" | "B";
type MatchDisplayPlayer = CustomMatchPlayerRecord | MatchmakingQueuePlayerRecord | TeamCandidate;

function buildDraftButtonCustomId(action: string, draftId: string): string {
  return `${TEAM_DRAFT_PREFIX}/${action}/${draftId}`;
}

function buildDraftSelectCustomId(draftId: string): string {
  return `${TEAM_DRAFT_SELECT_PREFIX}/${draftId}`;
}

function buildResultsButtonCustomId(
  action: "enter" | "team-b",
  matchId: number,
  winner?: WinningTeam,
): string {
  const params = new URLSearchParams();
  if (winner) {
    params.set("winner", winner);
  }
  return `${TEAM_RESULTS_PREFIX}/${action}/${matchId}${params.size > 0 ? `?${params.toString()}` : ""}`;
}

function buildResultsModalCustomId(team: "A" | "B", matchId: number, winner?: WinningTeam): string {
  const params = new URLSearchParams({ team });
  if (winner) {
    params.set("winner", winner);
  }
  return `${TEAM_RESULTS_MODAL_PREFIX}/${matchId}?${params.toString()}`;
}

function startOfUtcDayMs(nowMs = Date.now()): number {
  const date = new Date(nowMs);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function createRestClient(env: TeamEnv): DiscordRestClient {
  return new DiscordRestClient(env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN);
}

async function resolveTeamEmojiCatalog(
  env: TeamEnv,
  applicationId: string,
): Promise<ApplicationEmojiCatalog> {
  return resolveApplicationEmojiCatalog({
    applicationId,
    botToken: env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN,
    cache: env.Cache,
  });
}

function applyButtonEmoji(
  button: ButtonBuilder,
  emojis: ApplicationEmojiCatalog | null | undefined,
  emojiName?: AppEmojiName,
): ButtonBuilder {
  if (!emojiName) {
    return button;
  }

  const emoji = toComponentEmoji(emojis, emojiName);
  if (emoji) {
    button.setEmoji(emoji);
  }
  return button;
}

function buildTeamReply(input: {
  title: string;
  message: string;
  tone: "danger" | "info" | "primary" | "success" | "warning";
  emojiName: AppEmojiName;
  emojis?: ApplicationEmojiCatalog | null;
  details?: string[];
  actionRows?: ActionRowBuilder[];
  ephemeral?: boolean;
}) {
  return buildComponentsV2Reply(
    [
      buildNoticeCard({
        title: input.title,
        message: input.message,
        tone: input.tone,
        emojis: input.emojis,
        emojiName: input.emojiName,
        details: input.details,
        actionRows: input.actionRows,
      }),
    ],
    input.ephemeral ?? true,
  );
}

function readJsonId(value: unknown): string | null {
  if (
    value !== null &&
    typeof value === "object" &&
    "id" in value &&
    typeof value.id === "string"
  ) {
    return value.id;
  }
  return null;
}

function readSelectedValues(interaction: { raw: { data?: unknown } }): string[] {
  const data = interaction.raw.data;
  if (
    data === null ||
    typeof data !== "object" ||
    !("values" in data) ||
    !Array.isArray(data.values)
  ) {
    return [];
  }

  return data.values.filter((value): value is string => typeof value === "string");
}

function readPermissions(raw: unknown): bigint {
  if (
    raw !== null &&
    typeof raw === "object" &&
    "member" in raw &&
    raw.member !== null &&
    typeof raw.member === "object" &&
    "permissions" in raw.member &&
    typeof raw.member.permissions === "string"
  ) {
    try {
      return BigInt(raw.member.permissions);
    } catch {
      return 0n;
    }
  }

  return 0n;
}

function isGuildAdmin(raw: unknown): boolean {
  const permissions = readPermissions(raw);
  return (
    (permissions & PermissionFlagsBits.Administrator) === PermissionFlagsBits.Administrator ||
    (permissions & PermissionFlagsBits.ManageGuild) === PermissionFlagsBits.ManageGuild
  );
}

function formatBalanceRating(value: number | null | undefined): string {
  return typeof value === "number" ? String(Math.round(value)) : "pending";
}

function formatPlatformLabel(platform: string | null | undefined): string {
  switch (platform) {
    case "pc":
      return "PC";
    case "xbox":
      return "Xbox";
    case "playstation":
      return "PlayStation";
    default:
      return typeof platform === "string" && platform.length > 0 ? platform : "Unknown";
  }
}

function formatRelativeTime(timestampMs: number): string {
  return `<t:${Math.floor(timestampMs / 1000)}:R>`;
}

function formatCaptainLabel(discordUserId: string | null | undefined): string {
  return typeof discordUserId === "string" && discordUserId.length > 0
    ? `<@${discordUserId}>`
    : "Unknown";
}

function sumSeedScore(players: readonly TeamCandidate[]): number {
  return players.reduce((total, player) => total + player.metrics.seedScore, 0);
}

function buildDraftState(input: {
  draftId: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  mode: TeamDraftState["mode"];
  members: TeamDraftState["members"];
}): TeamDraftState {
  return {
    draftId: input.draftId,
    guildId: input.guildId,
    channelId: input.channelId,
    creatorId: input.creatorId,
    mode: input.mode,
    minPlayers: input.mode === "internal" ? 2 : MATCHMAKING_STACK_SIZE,
    maxPlayers: input.mode === "internal" ? 10 : MATCHMAKING_STACK_SIZE,
    selectedDiscordUserIds: [],
    invalidSelectedDiscordUserIds: [],
    members: input.members,
  };
}

function buildDraftModeLabel(mode: TeamDraftState["mode"]): string {
  return mode === "internal" ? "Internal custom balance" : "Cross-server 5v5 queue";
}

function buildDraftMessage(state: TeamDraftState, emojis?: ApplicationEmojiCatalog | null) {
  const selectedMembers = state.selectedDiscordUserIds
    .map((discordUserId) => state.members.find((member) => member.discordUserId === discordUserId))
    .filter((member): member is NonNullable<typeof member> => member !== undefined);
  const selectedLines =
    selectedMembers.length === 0
      ? "None"
      : selectedMembers
          .map(
            (member) =>
              `<@${member.discordUserId}> - ${member.username} (${formatPlatformLabel(
                member.platform,
              )} • Team ELO ${formatBalanceRating(member.balanceRating)})`,
          )
          .join("\n");
  const invalidLines =
    state.invalidSelectedDiscordUserIds.length === 0
      ? "None"
      : state.invalidSelectedDiscordUserIds
          .map((discordUserId) => `<@${discordUserId}>`)
          .join("\n");
  const select = new UserSelectMenuBuilder()
    .setCustomId(buildDraftSelectCustomId(state.draftId))
    .setPlaceholder(`Select up to ${state.maxPlayers} server members`)
    .setMinValues(0)
    .setMaxValues(state.maxPlayers)
    .setDisabled(false);

  if (state.selectedDiscordUserIds.length > 0) {
    const defaultValues: APISelectMenuDefaultValue<SelectMenuDefaultValueType.User>[] =
      state.selectedDiscordUserIds.map((discordUserId) => ({
        id: discordUserId,
        type: SelectMenuDefaultValueType.User,
      }));
    select.setDefaultValues(...defaultValues);
  }

  const selectRow = new ActionRowBuilder().addComponents(select);
  const buildLabel = state.mode === "internal" ? "Build Teams" : "Queue Stack";
  const buildDisabled =
    state.selectedDiscordUserIds.length < state.minPlayers ||
    state.selectedDiscordUserIds.length > state.maxPlayers;
  const buttons = new ActionRowBuilder().addComponents(
    applyButtonEmoji(
      new ButtonBuilder()
        .setCustomId(buildDraftButtonCustomId("clear", state.draftId))
        .setLabel("Clear")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(state.selectedDiscordUserIds.length === 0),
      emojis,
      "cancel",
    ),
    applyButtonEmoji(
      new ButtonBuilder()
        .setCustomId(buildDraftButtonCustomId("build", state.draftId))
        .setLabel(buildLabel)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(buildDisabled),
      emojis,
      "confirm",
    ),
    applyButtonEmoji(
      new ButtonBuilder()
        .setCustomId(buildDraftButtonCustomId("cancel", state.draftId))
        .setLabel("Cancel")
        .setStyle(ButtonStyle.Danger),
      emojis,
      "cancel",
    ),
  );

  return buildTeamReply({
    title: state.mode === "internal" ? "Team draft" : "Matchmaking draft",
    message:
      state.mode === "internal"
        ? "Pick registered-ready players, then build balanced teams."
        : "Pick exactly 5 registered-ready players. Any unready selection is ignored automatically.",
    tone: "primary",
    emojiName: "home",
    emojis,
    details: [
      `**Mode**\n${buildDraftModeLabel(state.mode)}`,
      `**Selected**\n${state.selectedDiscordUserIds.length}/${state.maxPlayers}`,
      `**Players**\n${selectedLines}`,
      `**Ignored**\n${invalidLines}`,
    ],
    actionRows: [selectRow, buttons],
  });
}

function readTeamBalanceRating(player: MatchDisplayPlayer): number {
  return "effectiveBalanceRating" in player ? player.effectiveBalanceRating : player.balanceRating;
}

function formatMatchPlayerLine(player: MatchDisplayPlayer): string {
  const kd =
    "kills" in player && player.kills !== null && player.deaths !== null
      ? ` - ${player.kills}/${player.deaths}`
      : "";
  return `<@${player.discordUserId}> (${formatPlatformLabel(player.platform)} • Team ELO ${formatBalanceRating(readTeamBalanceRating(player))})${kd}`;
}

function buildPublicMatchMessage(input: {
  title: string;
  matchId: number;
  teamA: readonly MatchDisplayPlayer[];
  teamB: readonly MatchDisplayPlayer[];
  teamABalanceTotal: number;
  teamBBalanceTotal: number;
  balanceGap: number;
  showResults?: boolean;
  emojis?: ApplicationEmojiCatalog | null;
  message?: string;
  extraDetails?: string[];
}) {
  const showResults = input.showResults ?? false;
  const teamALines = input.teamA.map((player) => formatMatchPlayerLine(player));
  const teamBLines = input.teamB.map((player) => formatMatchPlayerLine(player));

  const button = applyButtonEmoji(
    new ButtonBuilder()
      .setCustomId(buildResultsButtonCustomId("enter", input.matchId))
      .setLabel(showResults ? "Results Submitted" : "Enter Results")
      .setStyle(showResults ? ButtonStyle.Secondary : ButtonStyle.Primary)
      .setDisabled(showResults),
    input.emojis,
    showResults ? "confirm" : "strong",
  );

  return buildTeamReply({
    title: input.title,
    message:
      input.message ??
      (showResults ? "Results have been submitted for this match." : "Teams are ready."),
    tone: showResults ? "success" : "primary",
    emojiName: showResults ? "confirm" : "strong",
    emojis: input.emojis,
    details: [
      `**Match**\n#${input.matchId}`,
      `**Team ELO Gap**\n${formatBalanceRating(input.balanceGap)}`,
      ...(input.extraDetails ?? []),
      `**Team A** (Team ELO ${formatBalanceRating(input.teamABalanceTotal)})\n${teamALines.join("\n")}`,
      `**Team B** (Team ELO ${formatBalanceRating(input.teamBBalanceTotal)})\n${teamBLines.join("\n")}`,
    ],
    actionRows: [new ActionRowBuilder().addComponents(button)],
    ephemeral: false,
  });
}

function buildMatchmakingQueueStatusReply(
  queue: MatchmakingQueueWithPlayers,
  emojis?: ApplicationEmojiCatalog | null,
) {
  return buildTeamReply({
    title: "Queue active",
    message: "This server already has a 5-stack waiting for an opponent.",
    tone: "info",
    emojiName: "timer",
    emojis,
    details: [
      `**Captain**\n<@${queue.captainDiscordUserId}>`,
      `**Queue Expires**\n${formatRelativeTime(queue.expiresAt)}`,
      `**Stack Balance**\nTotal ${formatBalanceRating(queue.stackBalanceTotal)} • Avg ${formatBalanceRating(queue.stackBalanceAverage)}`,
      `**Players**\n${queue.players.map((player) => formatMatchPlayerLine(player)).join("\n")}`,
    ],
  });
}

function buildActiveCrossGuildMatchStatusReply(
  match: NonNullable<Awaited<ReturnType<typeof getCustomMatch>>>,
  emojis?: ApplicationEmojiCatalog | null,
) {
  const teamAPlayers = match.players.filter((player) => player.team === "A");
  const teamBPlayers = match.players.filter((player) => player.team === "B");
  return buildTeamReply({
    title: "Cross-server match active",
    message: "This server already has a pending cross-server match.",
    tone: "info",
    emojiName: "strong",
    emojis,
    details: [
      `**Match**\n#${match.id}`,
      `**Captains**\n${formatCaptainLabel(match.createdByDiscordUserId)} vs ${formatCaptainLabel(match.opponentCaptainDiscordUserId)}`,
      `**Team ELO Gap**\n${formatBalanceRating(match.balanceGap)}`,
      `**Team A** (Team ELO ${formatBalanceRating(match.teamABalanceTotal)})\n${teamAPlayers.map((player) => formatMatchPlayerLine(player)).join("\n")}`,
      `**Team B** (Team ELO ${formatBalanceRating(match.teamBBalanceTotal)})\n${teamBPlayers.map((player) => formatMatchPlayerLine(player)).join("\n")}`,
    ],
  });
}

function buildPendingMirrorMessage(emojis?: ApplicationEmojiCatalog | null) {
  return buildTeamReply({
    title: "Cross-server match found",
    message: "Match found. Preparing the mirrored match cards now.",
    tone: "info",
    emojiName: "timer",
    emojis,
    ephemeral: false,
  });
}

function buildMirrorFailureMessage(emojis?: ApplicationEmojiCatalog | null) {
  return buildTeamReply({
    title: "Matchmaking sync failed",
    message: "A potential opponent was found, but message setup failed. The queue remains active.",
    tone: "warning",
    emojiName: "warning",
    emojis,
    ephemeral: false,
  });
}

function buildResultModal(
  team: "A" | "B",
  matchId: number,
  players: readonly CustomMatchPlayerRecord[],
  winner?: WinningTeam,
) {
  const modal = new ModalBuilder()
    .setCustomId(buildResultsModalCustomId(team, matchId, winner))
    .setTitle(team === "A" ? "Team A Results" : "Team B Results");

  for (const player of players) {
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId(`player:${player.discordUserId}`)
          .setLabel(player.username ?? player.discordUserId)
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("kills/deaths")
          .setRequired(true)
          .setMinLength(3)
          .setMaxLength(7),
      ),
    );
  }

  return modal;
}

function parseResultMap(
  interaction: { fields: { getString(customId: string, required?: boolean): string | null } },
  players: readonly CustomMatchPlayerRecord[],
): Map<string, { kills: number; deaths: number }> {
  const results = new Map<string, { kills: number; deaths: number }>();
  for (const player of players) {
    const raw = interaction.fields.getString(`player:${player.discordUserId}`, true) ?? "";
    results.set(player.discordUserId, parsePlayerResultInput(raw));
  }
  return results;
}

function canManageMatch(
  raw: unknown,
  match: {
    createdByDiscordUserId: string;
    guildId: string;
    opponentGuildId: string | null;
    opponentCaptainDiscordUserId: string | null;
  },
  userId: string,
  guildId: string | undefined,
): boolean {
  if (isCustomMatchCaptain(match, userId)) {
    return true;
  }

  if (!guildId || !isGuildAdmin(raw)) {
    return false;
  }

  return guildId === match.guildId || guildId === match.opponentGuildId;
}

async function postPublicMessage(
  rest: DiscordRestClient,
  channelId: string,
  payload: ReturnType<typeof buildComponentsV2Reply>,
) {
  return rest.createChannelMessage(channelId, {
    components: payload.components.map((component) => component.toJSON()),
    flags: COMPONENTS_V2_FLAGS,
  });
}

async function editPublicMessage(
  rest: DiscordRestClient,
  channelId: string,
  messageId: string,
  payload: ReturnType<typeof buildComponentsV2Reply>,
) {
  return rest.editChannelMessage(channelId, messageId, {
    components: payload.components.map((component) => component.toJSON()),
    flags: COMPONENTS_V2_FLAGS,
  });
}

async function handleInternalDraftBuild(
  interaction: Parameters<ReturnType<ComponentHandler["addHandler"]>["execute"]>[0],
  env: TeamEnv,
  state: TeamDraftState,
  draftId: string,
  emojis?: ApplicationEmojiCatalog | null,
) {
  if (!env.Database) {
    await interaction.update(
      buildTeamReply({
        title: "Configuration error",
        message: "Database binding is missing.",
        tone: "danger",
        emojiName: "warning",
        emojis,
      }),
    );
    return;
  }

  const validation = validateReadyRosterSelection(state.members, state.selectedDiscordUserIds);
  if (
    validation.players.length < state.minPlayers ||
    validation.players.length > state.maxPlayers
  ) {
    await interaction.reply(
      buildTeamReply({
        title: "Selection required",
        message: `Select between ${state.minPlayers} and ${state.maxPlayers} registered-ready players before building teams.`,
        tone: "warning",
        emojiName: "question_mark",
        emojis,
      }),
      true,
    );
    return;
  }

  await interaction.deferUpdate();

  const balanced = balanceTeams(validation.players);
  const matchId = await createCustomMatch(env.Database, {
    guildId: state.guildId,
    channelId: state.channelId,
    messageId: `pending:${interaction.id}`,
    createdByDiscordUserId: interaction.userId ?? "",
    status: "pending_results",
    teamASeedTotal: sumSeedScore(balanced.teamA),
    teamBSeedTotal: sumSeedScore(balanced.teamB),
    seedGap: Math.abs(sumSeedScore(balanced.teamA) - sumSeedScore(balanced.teamB)),
    teamABalanceTotal: balanced.teamABalanceTotal,
    teamBBalanceTotal: balanced.teamBBalanceTotal,
    balanceGap: balanced.balanceGap,
    players: [
      ...balanced.teamA.map((player, index) => ({
        discordUserId: player.discordUserId,
        playerId: player.playerId,
        team: "A" as const,
        slot: index,
        seedRankPoints: player.metrics.rankPoints,
        seedKdRatio: player.metrics.kdRatio,
        seedKost: player.metrics.kost,
        seedKpr: player.metrics.kpr,
        seedHeadshotPercentage: player.metrics.headshotPercentage,
        seedScore: player.metrics.seedScore,
        balanceRating: player.effectiveBalanceRating,
      })),
      ...balanced.teamB.map((player, index) => ({
        discordUserId: player.discordUserId,
        playerId: player.playerId,
        team: "B" as const,
        slot: index,
        seedRankPoints: player.metrics.rankPoints,
        seedKdRatio: player.metrics.kdRatio,
        seedKost: player.metrics.kost,
        seedKpr: player.metrics.kpr,
        seedHeadshotPercentage: player.metrics.headshotPercentage,
        seedScore: player.metrics.seedScore,
        balanceRating: player.effectiveBalanceRating,
      })),
    ],
  });

  const publicPayload = buildPublicMatchMessage({
    title: "R6 Custom Teams",
    matchId,
    teamA: balanced.teamA,
    teamB: balanced.teamB,
    teamABalanceTotal: balanced.teamABalanceTotal,
    teamBBalanceTotal: balanced.teamBBalanceTotal,
    balanceGap: balanced.balanceGap,
    showResults: false,
    emojis,
  });
  const rest = createRestClient(env);
  const publicMessageResult = await postPublicMessage(rest, state.channelId, publicPayload);

  if (publicMessageResult.isErr()) {
    await interaction.editReply(
      buildTeamReply({
        title: "Announcement failed",
        message: "I couldn't post the team announcement to this channel.",
        tone: "danger",
        emojiName: "cancel",
        emojis,
      }),
    );
    return;
  }

  const messageId = readJsonId(publicMessageResult.value);
  if (!messageId) {
    await interaction.editReply(
      buildTeamReply({
        title: "Announcement incomplete",
        message: "I created the teams but couldn't read the posted message ID.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
    );
    return;
  }

  await updateCustomMatchMessageId(env.Database, { matchId, messageId });
  await deleteTeamDraftState(env.Cache, draftId);
  await interaction.editReply(
    buildTeamReply({
      title: "Teams posted",
      message: "Posted the teams to this channel.",
      tone: "success",
      emojiName: "confirm",
      emojis,
    }),
  );
}

async function handleMatchmakingDraftBuild(
  interaction: Parameters<ReturnType<ComponentHandler["addHandler"]>["execute"]>[0],
  env: TeamEnv,
  state: TeamDraftState,
  draftId: string,
  emojis?: ApplicationEmojiCatalog | null,
) {
  if (!env.Database) {
    await interaction.update(
      buildTeamReply({
        title: "Configuration error",
        message: "Database binding is missing.",
        tone: "danger",
        emojiName: "warning",
        emojis,
      }),
    );
    return;
  }

  const validation = validateReadyRosterSelection(state.members, state.selectedDiscordUserIds);
  if (validation.players.length !== MATCHMAKING_STACK_SIZE) {
    await interaction.reply(
      buildTeamReply({
        title: "Full stack required",
        message: "Select exactly 5 registered-ready players before entering the queue.",
        tone: "warning",
        emojiName: "question_mark",
        emojis,
      }),
      true,
    );
    return;
  }

  await interaction.deferUpdate();
  await expireStaleMatchmakingQueues(env.Database);

  const activeGuildQueue = await getActiveMatchmakingQueueForGuild(env.Database, state.guildId);
  if (activeGuildQueue) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(activeGuildQueue, emojis));
    return;
  }

  const activeCaptainQueue = await getActiveMatchmakingQueueForCaptain(
    env.Database,
    state.creatorId,
  );
  if (activeCaptainQueue) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(
      buildTeamReply({
        title: "Captain already queued",
        message: "You already have an active matchmaking queue entry.",
        tone: "warning",
        emojiName: "warning",
        emojis,
        details: [
          `**Queue Guild**\n${activeCaptainQueue.guildId}`,
          `**Queue Expires**\n${formatRelativeTime(activeCaptainQueue.expiresAt)}`,
        ],
      }),
    );
    return;
  }

  const activeMatch = await getActiveCrossGuildMatchForGuild(env.Database, state.guildId);
  if (activeMatch) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildActiveCrossGuildMatchStatusReply(activeMatch, emojis));
    return;
  }

  const queuedQueues = await listQueuedMatchmakingQueues(env.Database);
  const conflictingPlayers = findReservedMatchmakingPlayerIds(validation.players, queuedQueues);
  if (conflictingPlayers.length > 0) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(
      buildTeamReply({
        title: "Players already reserved",
        message: "One or more selected players are already in another active queue.",
        tone: "warning",
        emojiName: "warning",
        emojis,
        details: [
          `**Conflicts**\n${conflictingPlayers.map((discordUserId) => `<@${discordUserId}>`).join("\n")}`,
        ],
      }),
    );
    return;
  }

  const snapshot = buildMatchmakingQueueSnapshot(validation.players);
  const now = Date.now();
  const queueId = await createMatchmakingQueue(env.Database, {
    guildId: state.guildId,
    channelId: state.channelId,
    captainDiscordUserId: state.creatorId,
    status: "queued",
    playerCount: snapshot.playerCount,
    stackBalanceTotal: snapshot.stackBalanceTotal,
    stackBalanceAverage: snapshot.stackBalanceAverage,
    expiresAt: now + MATCHMAKING_QUEUE_TTL_MS,
    players: toMatchmakingQueuePlayers(validation.players),
  });

  const currentQueue = await getMatchmakingQueue(env.Database, queueId);
  if (!currentQueue) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(
      buildTeamReply({
        title: "Queue failed",
        message: "I couldn't reload the new queue entry after creating it.",
        tone: "danger",
        emojiName: "cancel",
        emojis,
      }),
    );
    return;
  }

  const opponentCandidate = chooseBestMatchmakingOpponent(currentQueue, queuedQueues, now);
  if (!opponentCandidate) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(currentQueue, emojis));
    return;
  }

  const opponentQueue = await getMatchmakingQueue(env.Database, opponentCandidate.id);
  if (!opponentQueue || opponentQueue.status !== "queued") {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(currentQueue, emojis));
    return;
  }

  const rest = createRestClient(env);
  const pendingPayload = buildPendingMirrorMessage(emojis);
  const opponentMessageResult = await postPublicMessage(
    rest,
    opponentQueue.channelId,
    pendingPayload,
  );
  if (opponentMessageResult.isErr()) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(currentQueue, emojis));
    return;
  }

  const opponentMessageId = readJsonId(opponentMessageResult.value);
  if (!opponentMessageId) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(currentQueue, emojis));
    return;
  }

  const currentMessageResult = await postPublicMessage(
    rest,
    currentQueue.channelId,
    pendingPayload,
  );
  if (currentMessageResult.isErr()) {
    await editPublicMessage(
      rest,
      opponentQueue.channelId,
      opponentMessageId,
      buildMirrorFailureMessage(emojis),
    );
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(currentQueue, emojis));
    return;
  }

  const currentMessageId = readJsonId(currentMessageResult.value);
  if (!currentMessageId) {
    await editPublicMessage(
      rest,
      opponentQueue.channelId,
      opponentMessageId,
      buildMirrorFailureMessage(emojis),
    );
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(currentQueue, emojis));
    return;
  }

  const matchId = await createCustomMatch(env.Database, {
    guildId: opponentQueue.guildId,
    channelId: opponentQueue.channelId,
    messageId: opponentMessageId,
    createdByDiscordUserId: opponentQueue.captainDiscordUserId,
    status: "pending_results",
    matchType: "cross_guild",
    opponentGuildId: currentQueue.guildId,
    opponentChannelId: currentQueue.channelId,
    opponentMessageId: currentMessageId,
    opponentCaptainDiscordUserId: currentQueue.captainDiscordUserId,
    teamASeedTotal: opponentQueue.players.reduce((total, player) => total + player.seedScore, 0),
    teamBSeedTotal: currentQueue.players.reduce((total, player) => total + player.seedScore, 0),
    seedGap: Math.abs(
      opponentQueue.players.reduce((total, player) => total + player.seedScore, 0) -
        currentQueue.players.reduce((total, player) => total + player.seedScore, 0),
    ),
    teamABalanceTotal: opponentQueue.stackBalanceTotal,
    teamBBalanceTotal: currentQueue.stackBalanceTotal,
    balanceGap: Math.abs(opponentQueue.stackBalanceTotal - currentQueue.stackBalanceTotal),
    players: [
      ...opponentQueue.players.map((player) => ({
        discordUserId: player.discordUserId,
        playerId: player.playerId,
        team: "A" as const,
        slot: player.slot,
        seedRankPoints: player.seedRankPoints,
        seedKdRatio: player.seedKdRatio,
        seedKost: player.seedKost,
        seedKpr: player.seedKpr,
        seedHeadshotPercentage: player.seedHeadshotPercentage,
        seedScore: player.seedScore,
        balanceRating: player.balanceRating,
      })),
      ...currentQueue.players.map((player) => ({
        discordUserId: player.discordUserId,
        playerId: player.playerId,
        team: "B" as const,
        slot: player.slot,
        seedRankPoints: player.seedRankPoints,
        seedKdRatio: player.seedKdRatio,
        seedKost: player.seedKost,
        seedKpr: player.seedKpr,
        seedHeadshotPercentage: player.seedHeadshotPercentage,
        seedScore: player.seedScore,
        balanceRating: player.balanceRating,
      })),
    ],
  });

  await markMatchmakingQueueMatched(env.Database, {
    queueId: opponentQueue.id,
    matchId,
  });
  await markMatchmakingQueueMatched(env.Database, {
    queueId: currentQueue.id,
    matchId,
  });

  const publicPayload = buildPublicMatchMessage({
    title: "Cross-Server 5v5 Match",
    matchId,
    teamA: opponentQueue.players,
    teamB: currentQueue.players,
    teamABalanceTotal: opponentQueue.stackBalanceTotal,
    teamBBalanceTotal: currentQueue.stackBalanceTotal,
    balanceGap: Math.abs(opponentQueue.stackBalanceTotal - currentQueue.stackBalanceTotal),
    showResults: false,
    emojis,
    message:
      "Two full stacks have been matched. Either captain can submit results through the bot.",
    extraDetails: [
      `**Captains**\n<@${opponentQueue.captainDiscordUserId}> vs <@${currentQueue.captainDiscordUserId}>`,
    ],
  });

  const editAResult = await editPublicMessage(
    rest,
    opponentQueue.channelId,
    opponentMessageId,
    publicPayload,
  );
  const editBResult = await editPublicMessage(
    rest,
    currentQueue.channelId,
    currentMessageId,
    publicPayload,
  );

  await deleteTeamDraftState(env.Cache, draftId);

  if (editAResult.isErr() || editBResult.isErr()) {
    await interaction.editReply(
      buildTeamReply({
        title: "Match created with warning",
        message:
          "The cross-server match was created, but I couldn't update both public match cards cleanly.",
        tone: "warning",
        emojiName: "warning",
        emojis,
        details: [`**Match**\n#${matchId}`],
      }),
    );
    return;
  }

  await interaction.editReply(
    buildTeamReply({
      title: "Match created",
      message: "Matched your 5-stack against another server and posted the mirrored match cards.",
      tone: "success",
      emojiName: "confirm",
      emojis,
      details: [
        `**Match**\n#${matchId}`,
        `**Opponent Captain**\n<@${opponentQueue.captainDiscordUserId}>`,
      ],
    }),
  );
}

export const teamCommand = new SlashCommand()
  .setName("team")
  .setDescription("Balance customs and manage cross-server 5v5 matchmaking")
  .addSubcommand((option) =>
    option.setName("create").setDescription("Build fair teams from ready registered players"),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("limit")
      .setDescription("Manage the guild's recorded-match limit")
      .addSubcommand((option) =>
        option
          .setName("set")
          .setDescription("Set the number of recorded matches allowed per day")
          .addIntegerOption((integerOption) =>
            integerOption
              .setName("matches_per_day")
              .setDescription("Daily recorded match limit")
              .setRequired(true)
              .setMinValue(1)
              .setMaxValue(100),
          ),
      )
      .addSubcommand((option) =>
        option.setName("clear").setDescription("Remove the guild-specific daily match limit"),
      )
      .addSubcommand((option) =>
        option.setName("show").setDescription("Show the current daily match limit"),
      ),
  )
  .addSubcommandGroup((group) =>
    group
      .setName("match")
      .setDescription("Queue, inspect, and cancel cross-server 5v5 matchmaking")
      .addSubcommand((option) =>
        option.setName("queue").setDescription("Queue a full 5-stack for cross-server matchmaking"),
      )
      .addSubcommand((option) =>
        option.setName("status").setDescription("Show the active queue or cross-server match"),
      )
      .addSubcommand((option) =>
        option.setName("cancel").setDescription("Cancel the active queued 5-stack for this server"),
      ),
  )
  .addHandler(async (interaction) => {
    if (!interaction.guildId || !interaction.channelId || !interaction.userId) {
      const env = interaction.context.env as TeamEnv;
      const emojis = await resolveTeamEmojiCatalog(env, interaction.applicationId);
      await interaction.reply(
        buildTeamReply({
          title: "Server only",
          message: "This command only works in a server.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
        true,
      );
      return;
    }

    const env = interaction.context.env as TeamEnv;
    const emojis = await resolveTeamEmojiCatalog(env, interaction.applicationId);
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommandGroup === "limit") {
      await interaction.deferReply(true);

      if (!env.Database) {
        await interaction.editReply(
          buildTeamReply({
            title: "Configuration error",
            message: "Database binding is missing.",
            tone: "danger",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      if (subcommand === "show") {
        const limit = await getGuildLimit(env.Database, interaction.guildId);
        await interaction.editReply(
          buildTeamReply({
            title: "Daily match limit",
            message: limit
              ? `This server can record **${limit.dailyMatchLimit}** matches per day.`
              : "This server currently has no daily match limit.",
            tone: "info",
            emojiName: "information",
            emojis,
          }),
        );
        return;
      }

      if (!isGuildAdmin(interaction.raw)) {
        await interaction.editReply(
          buildTeamReply({
            title: "Admin required",
            message: "Only a server admin can change the daily match limit.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      if (subcommand === "set") {
        const dailyLimit = interaction.options.getInteger("matches_per_day", true)!;
        await upsertGuildLimit(env.Database, {
          guildId: interaction.guildId,
          dailyMatchLimit: dailyLimit,
          updatedByDiscordUserId: interaction.userId,
        });
        await interaction.editReply(
          buildTeamReply({
            title: "Daily match limit updated",
            message: `Set the daily recorded-match limit to **${dailyLimit}**.`,
            tone: "success",
            emojiName: "confirm",
            emojis,
          }),
        );
        return;
      }

      await clearGuildLimit(env.Database, interaction.guildId);
      await interaction.editReply(
        buildTeamReply({
          title: "Daily match limit cleared",
          message: "Cleared the daily recorded-match limit for this server.",
          tone: "success",
          emojiName: "confirm",
          emojis,
        }),
      );
      return;
    }

    if (!env.Database) {
      await interaction.reply(
        buildTeamReply({
          title: "Configuration error",
          message: "Database binding is missing.",
          tone: "danger",
          emojiName: "warning",
          emojis,
        }),
        true,
      );
      return;
    }

    if (subcommandGroup === "match") {
      await interaction.deferReply(true);
      await expireStaleMatchmakingQueues(env.Database);

      if (subcommand === "status") {
        const activeQueue = await getActiveMatchmakingQueueForGuild(
          env.Database,
          interaction.guildId,
        );
        if (activeQueue) {
          await interaction.editReply(buildMatchmakingQueueStatusReply(activeQueue, emojis));
          return;
        }

        const activeMatch = await getActiveCrossGuildMatchForGuild(
          env.Database,
          interaction.guildId,
        );
        if (activeMatch) {
          await interaction.editReply(buildActiveCrossGuildMatchStatusReply(activeMatch, emojis));
          return;
        }

        await interaction.editReply(
          buildTeamReply({
            title: "No active matchmaking",
            message: "This server does not currently have an active queue or cross-server match.",
            tone: "info",
            emojiName: "information",
            emojis,
          }),
        );
        return;
      }

      if (subcommand === "cancel") {
        const activeQueue = await getActiveMatchmakingQueueForGuild(
          env.Database,
          interaction.guildId,
        );
        if (!activeQueue) {
          await interaction.editReply(
            buildTeamReply({
              title: "No active queue",
              message: "This server does not have an active queued 5-stack to cancel.",
              tone: "warning",
              emojiName: "question_mark",
              emojis,
            }),
          );
          return;
        }

        if (
          interaction.userId !== activeQueue.captainDiscordUserId &&
          !isGuildAdmin(interaction.raw)
        ) {
          await interaction.editReply(
            buildTeamReply({
              title: "Permission required",
              message: "Only the queue creator or a server admin can cancel this queue.",
              tone: "warning",
              emojiName: "warning",
              emojis,
            }),
          );
          return;
        }

        await cancelMatchmakingQueue(env.Database, activeQueue.id);
        await interaction.editReply(
          buildTeamReply({
            title: "Queue cancelled",
            message: "Cancelled the active cross-server matchmaking queue for this server.",
            tone: "success",
            emojiName: "confirm",
            emojis,
          }),
        );
        return;
      }

      const activeGuildQueue = await getActiveMatchmakingQueueForGuild(
        env.Database,
        interaction.guildId,
      );
      if (activeGuildQueue) {
        await interaction.editReply(buildMatchmakingQueueStatusReply(activeGuildQueue, emojis));
        return;
      }

      const activeCaptainQueue = await getActiveMatchmakingQueueForCaptain(
        env.Database,
        interaction.userId,
      );
      if (activeCaptainQueue) {
        await interaction.editReply(
          buildTeamReply({
            title: "Captain already queued",
            message: "You already have an active matchmaking queue entry.",
            tone: "warning",
            emojiName: "warning",
            emojis,
            details: [
              `**Queue Guild**\n${activeCaptainQueue.guildId}`,
              `**Queue Expires**\n${formatRelativeTime(activeCaptainQueue.expiresAt)}`,
            ],
          }),
        );
        return;
      }

      const activeMatch = await getActiveCrossGuildMatchForGuild(env.Database, interaction.guildId);
      if (activeMatch) {
        await interaction.editReply(buildActiveCrossGuildMatchStatusReply(activeMatch, emojis));
        return;
      }

      const roster = await getOrBuildGuildRoster(env.Cache, env.Database, interaction.guildId);
      const readyMembers = roster.filter((member) => member.ready && member.balanceRating !== null);
      if (readyMembers.length < MATCHMAKING_STACK_SIZE) {
        await interaction.editReply(
          buildTeamReply({
            title: "Not enough ready players",
            message: `This server only has **${readyMembers.length}** ready registered players. You need exactly ${MATCHMAKING_STACK_SIZE}.`,
            tone: "warning",
            emojiName: "question_mark",
            emojis,
          }),
        );
        return;
      }

      const draftState = buildDraftState({
        draftId: interaction.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        creatorId: interaction.userId,
        mode: "matchmaking",
        members: readyMembers,
      });
      await writeTeamDraftState(env.Cache, interaction.id, draftState);
      await interaction.editReply(buildDraftMessage(draftState, emojis));
      return;
    }

    await interaction.deferReply(true);

    const roster = await getOrBuildGuildRoster(env.Cache, env.Database, interaction.guildId);
    const readyMembers = roster.filter((member) => member.ready && member.balanceRating !== null);

    if (readyMembers.length < 2) {
      await interaction.editReply(
        buildTeamReply({
          title: "Not enough ready players",
          message: `This server only has **${readyMembers.length}** ready registered players. You need at least 2.`,
          tone: "warning",
          emojiName: "question_mark",
          emojis,
        }),
      );
      return;
    }

    const draftState = buildDraftState({
      draftId: interaction.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      creatorId: interaction.userId,
      mode: "internal",
      members: readyMembers,
    });

    await writeTeamDraftState(env.Cache, interaction.id, draftState);
    await interaction.editReply(buildDraftMessage(draftState, emojis));
  });

export const teamDraftButtonHandler = new ComponentHandler(
  TEAM_DRAFT_PREFIX,
  ComponentType.Button,
).addHandler(async (interaction) => {
  const env = interaction.context.env as TeamEnv;
  const emojis = await resolveTeamEmojiCatalog(env, interaction.applicationId);
  const parsed = parseCustomId(interaction.customId);
  if (typeof parsed === "string" || parsed.path.length < 3) {
    await interaction.reply(
      buildTeamReply({
        title: "Invalid draft control",
        message: "This team draft control is invalid.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  const [, action, draftId] = parsed.path;
  if (!draftId) {
    await interaction.reply(
      buildTeamReply({
        title: "Draft expired",
        message: "This team draft expired.",
        tone: "warning",
        emojiName: "timer",
        emojis,
      }),
      true,
    );
    return;
  }

  const state = await readTeamDraftState(env.Cache, draftId);
  if (!state) {
    await interaction.reply(
      buildTeamReply({
        title: "Draft expired",
        message: "This team draft expired. Run `/team create` or `/team match queue` again.",
        tone: "warning",
        emojiName: "timer",
        emojis,
      }),
      true,
    );
    return;
  }

  if (interaction.userId !== state.creatorId) {
    await interaction.reply(
      buildTeamReply({
        title: "Not your draft",
        message: "Only the draft creator can use these controls.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  if (action === "cancel") {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.update(
      buildTeamReply({
        title: "Draft cancelled",
        message: "Cancelled this team draft.",
        tone: "info",
        emojiName: "cancel",
        emojis,
      }),
    );
    return;
  }

  if (action === "clear") {
    const nextState: TeamDraftState = {
      ...state,
      selectedDiscordUserIds: [],
      invalidSelectedDiscordUserIds: [],
    };

    await writeTeamDraftState(env.Cache, draftId, nextState);
    await interaction.update(buildDraftMessage(nextState, emojis));
    return;
  }

  if (action !== "build") {
    await interaction.reply(
      buildTeamReply({
        title: "Unknown draft action",
        message: "Unknown draft action.",
        tone: "warning",
        emojiName: "question_mark",
        emojis,
      }),
      true,
    );
    return;
  }

  if (state.mode === "matchmaking") {
    await handleMatchmakingDraftBuild(interaction, env, state, draftId, emojis);
    return;
  }

  await handleInternalDraftBuild(interaction, env, state, draftId, emojis);
});

export const teamDraftSelectHandler = new ComponentHandler(
  TEAM_DRAFT_SELECT_PREFIX,
  ComponentType.UserSelect,
).addHandler(async (interaction) => {
  const env = interaction.context.env as TeamEnv;
  const emojis = await resolveTeamEmojiCatalog(env, interaction.applicationId);
  const parsed = parseCustomId(interaction.customId);
  if (typeof parsed === "string" || parsed.path.length < 2) {
    await interaction.reply(
      buildTeamReply({
        title: "Invalid draft control",
        message: "This team draft control is invalid.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  const draftId = parsed.path[1];
  if (!draftId) {
    await interaction.reply(
      buildTeamReply({
        title: "Draft expired",
        message: "This team draft expired.",
        tone: "warning",
        emojiName: "timer",
        emojis,
      }),
      true,
    );
    return;
  }

  const state = await readTeamDraftState(env.Cache, draftId);
  if (!state) {
    await interaction.reply(
      buildTeamReply({
        title: "Draft expired",
        message: "This team draft expired. Run `/team create` or `/team match queue` again.",
        tone: "warning",
        emojiName: "timer",
        emojis,
      }),
      true,
    );
    return;
  }

  if (interaction.userId !== state.creatorId) {
    await interaction.reply(
      buildTeamReply({
        title: "Not your draft",
        message: "Only the draft creator can use these controls.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  const selectedValues = [...new Set(readSelectedValues(interaction))];
  const validation = validateReadyRosterSelection(state.members, selectedValues);
  const nextState: TeamDraftState = {
    ...state,
    selectedDiscordUserIds: validation.selectedDiscordUserIds,
    invalidSelectedDiscordUserIds: validation.invalidSelectedDiscordUserIds,
  };

  await writeTeamDraftState(env.Cache, draftId, nextState);
  await interaction.update(buildDraftMessage(nextState, emojis));
});

export const teamResultsButtonHandler = new ComponentHandler(
  TEAM_RESULTS_PREFIX,
  ComponentType.Button,
).addHandler(async (interaction) => {
  const env = interaction.context.env as TeamEnv;
  const emojis = await resolveTeamEmojiCatalog(env, interaction.applicationId);
  const parsed = parseCustomId(interaction.customId);
  if (typeof parsed === "string" || parsed.path.length < 3) {
    await interaction.reply(
      buildTeamReply({
        title: "Invalid results control",
        message: "This results control is invalid.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  const [, action, matchIdValue] = parsed.path;
  const matchId = Number(matchIdValue);
  if (!Number.isInteger(matchId)) {
    await interaction.reply(
      buildTeamReply({
        title: "Invalid match reference",
        message: "This match reference is invalid.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  const match = await getCustomMatch(env.Database, matchId);
  if (!match) {
    await interaction.reply(
      buildTeamReply({
        title: "Match missing",
        message: "This match no longer exists.",
        tone: "danger",
        emojiName: "cancel",
        emojis,
      }),
      true,
    );
    return;
  }

  if (
    !interaction.userId ||
    !canManageMatch(interaction.raw, match, interaction.userId, interaction.guildId)
  ) {
    await interaction.reply(
      buildTeamReply({
        title: "Permission required",
        message: "Only a match captain or a server admin can submit results.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  if (match.status === "completed") {
    await interaction.reply(
      buildTeamReply({
        title: "Results already submitted",
        message: "Results have already been submitted for this match.",
        tone: "info",
        emojiName: "confirm",
        emojis,
      }),
      true,
    );
    return;
  }

  if (action === "enter") {
    const teamAPlayers = match.players.filter((player) => player.team === "A");
    await interaction.showModal(buildResultModal("A", matchId, teamAPlayers));
    return;
  }

  if (action !== "team-b") {
    await interaction.reply(
      buildTeamReply({
        title: "Unknown results action",
        message: "Unknown results action.",
        tone: "warning",
        emojiName: "question_mark",
        emojis,
      }),
      true,
    );
    return;
  }

  const session = await readTeamResultSession(env.Cache, matchId);
  if (!session) {
    await interaction.reply(
      buildTeamReply({
        title: "Results session expired",
        message: "The Team A results session expired. Start again from the match message.",
        tone: "warning",
        emojiName: "timer",
        emojis,
      }),
      true,
    );
    return;
  }

  if (session.submitterId !== interaction.userId) {
    await interaction.reply(
      buildTeamReply({
        title: "Submitter mismatch",
        message: "The same person who entered Team A must finish Team B.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  const winner = parsed.params.get("winner");
  if (winner !== "A" && winner !== "B") {
    await interaction.reply(
      buildTeamReply({
        title: "Winning team missing",
        message: "This results control is missing the winning team.",
        tone: "warning",
        emojiName: "question_mark",
        emojis,
      }),
      true,
    );
    return;
  }

  const teamBPlayers = match.players.filter((player) => player.team === "B");
  await interaction.showModal(buildResultModal("B", matchId, teamBPlayers, winner));
});

export const teamResultsModalHandler = new ModalHandler(TEAM_RESULTS_MODAL_PREFIX).addHandler(
  async (interaction) => {
    const env = interaction.context.env as TeamEnv;
    const emojis = await resolveTeamEmojiCatalog(env, interaction.applicationId);
    const parsed = parseCustomId(interaction.customId);
    if (typeof parsed === "string" || parsed.path.length < 2) {
      await interaction.reply(
        buildTeamReply({
          title: "Invalid results form",
          message: "This results form is invalid.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
        true,
      );
      return;
    }

    const matchId = Number(parsed.path[1]);
    const team = parsed.params.get("team");
    const winner = parsed.params.get("winner");
    if (!Number.isInteger(matchId) || (team !== "A" && team !== "B")) {
      await interaction.reply(
        buildTeamReply({
          title: "Invalid results form",
          message: "This results form is invalid.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
        true,
      );
      return;
    }

    await interaction.deferReply(true);

    const match = await getCustomMatch(env.Database, matchId);
    if (!match) {
      await interaction.editReply(
        buildTeamReply({
          title: "Match missing",
          message: "This match no longer exists.",
          tone: "danger",
          emojiName: "cancel",
          emojis,
        }),
      );
      return;
    }

    if (
      !interaction.userId ||
      !canManageMatch(interaction.raw, match, interaction.userId, interaction.guildId)
    ) {
      await interaction.editReply(
        buildTeamReply({
          title: "Permission required",
          message: "Only a match captain or a server admin can submit results.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    if (team === "A") {
      const teamAPlayers = match.players.filter((player) => player.team === "A");
      let teamAResults: Map<string, { kills: number; deaths: number }>;
      try {
        teamAResults = parseResultMap(interaction, teamAPlayers);
      } catch (error) {
        await interaction.editReply(
          buildTeamReply({
            title: "Invalid Team A results",
            message: error instanceof Error ? error.message : "Invalid Team A results.",
            tone: "warning",
            emojiName: "question_mark",
            emojis,
          }),
        );
        return;
      }
      await writeTeamResultSession(env.Cache, {
        matchId,
        guildId: match.guildId,
        submitterId: interaction.userId,
        teamAResults: Object.fromEntries(teamAResults),
      });
      await interaction.editReply(
        buildTeamReply({
          title: "Team A stored",
          message: "Stored Team A results. Continue with Team B.",
          tone: "info",
          emojiName: "confirm",
          emojis,
          actionRows: [
            new ActionRowBuilder().addComponents(
              applyButtonEmoji(
                new ButtonBuilder()
                  .setCustomId(buildResultsButtonCustomId("team-b", matchId, "A"))
                  .setLabel("Team A Won")
                  .setStyle(ButtonStyle.Success),
                emojis,
                "confirm",
              ),
              applyButtonEmoji(
                new ButtonBuilder()
                  .setCustomId(buildResultsButtonCustomId("team-b", matchId, "B"))
                  .setLabel("Team B Won")
                  .setStyle(ButtonStyle.Primary),
                emojis,
                "strong",
              ),
            ),
          ],
        }),
      );
      return;
    }

    if (winner !== "A" && winner !== "B") {
      await interaction.editReply(
        buildTeamReply({
          title: "Winning team missing",
          message: "This results form is missing the winning team.",
          tone: "warning",
          emojiName: "question_mark",
          emojis,
        }),
      );
      return;
    }

    const session = await readTeamResultSession(env.Cache, matchId);
    if (!session) {
      await interaction.editReply(
        buildTeamReply({
          title: "Results session expired",
          message: "The Team A results session expired. Start again from the match message.",
          tone: "warning",
          emojiName: "timer",
          emojis,
        }),
      );
      return;
    }

    if (session.submitterId !== interaction.userId) {
      await interaction.editReply(
        buildTeamReply({
          title: "Submitter mismatch",
          message: "The same person who entered Team A must finish Team B.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    const guildIdsToCheck = [match.guildId, match.opponentGuildId].filter(
      (guildId): guildId is string => typeof guildId === "string" && guildId.length > 0,
    );
    for (const guildId of guildIdsToCheck) {
      const limit = await getGuildLimit(env.Database, guildId);
      if (!limit) {
        continue;
      }

      const completedToday = await countCompletedMatchesSince(
        env.Database,
        guildId,
        startOfUtcDayMs(),
      );
      if (completedToday >= limit.dailyMatchLimit) {
        const label = guildId === match.guildId ? "creator server" : "opponent server";
        await interaction.editReply(
          buildTeamReply({
            title: "Daily limit reached",
            message: `Cannot record this result because the ${label} already reached its daily recorded-match limit.`,
            tone: "warning",
            emojiName: "timer",
            emojis,
          }),
        );
        return;
      }
    }

    const teamBPlayers = match.players.filter((player) => player.team === "B");
    const teamAResults = new Map(Object.entries(session.teamAResults));
    let teamBResults: Map<string, { kills: number; deaths: number }>;
    try {
      teamBResults = parseResultMap(interaction, teamBPlayers);
    } catch (error) {
      await interaction.editReply(
        buildTeamReply({
          title: "Invalid Team B results",
          message: error instanceof Error ? error.message : "Invalid Team B results.",
          tone: "warning",
          emojiName: "question_mark",
          emojis,
        }),
      );
      return;
    }
    const merged = mergeTeamResults(teamAResults, teamBResults);

    if (!env.Database) {
      await interaction.editReply(
        buildTeamReply({
          title: "Configuration error",
          message: "Database binding is missing.",
          tone: "danger",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    await completeCustomMatch(env.Database, {
      matchId,
      resultsByDiscordUserId: merged,
      winningTeam: winner,
    });
    await deleteTeamResultSession(env.Cache, matchId);

    const completedMatch = await getCustomMatch(env.Database, matchId);
    if (!completedMatch) {
      await interaction.editReply(
        buildTeamReply({
          title: "Results saved with warning",
          message: "Saved the results, but couldn't reload the completed match.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    const rest = createRestClient(env);
    const publicPayload = buildPublicMatchMessage({
      title:
        completedMatch.matchType === "cross_guild" ? "Cross-Server 5v5 Match" : "R6 Custom Teams",
      matchId: completedMatch.id,
      teamA: completedMatch.players.filter((player) => player.team === "A"),
      teamB: completedMatch.players.filter((player) => player.team === "B"),
      teamABalanceTotal: completedMatch.teamABalanceTotal,
      teamBBalanceTotal: completedMatch.teamBBalanceTotal,
      balanceGap: completedMatch.balanceGap,
      showResults: true,
      emojis,
      message:
        completedMatch.matchType === "cross_guild"
          ? "Results have been submitted for this cross-server match."
          : "Results have been submitted for this match.",
      extraDetails:
        completedMatch.matchType === "cross_guild"
          ? [
              `**Captains**\n${formatCaptainLabel(completedMatch.createdByDiscordUserId)} vs ${formatCaptainLabel(completedMatch.opponentCaptainDiscordUserId)}`,
            ]
          : undefined,
    });

    const editResults = [
      await editPublicMessage(
        rest,
        completedMatch.channelId,
        completedMatch.messageId,
        publicPayload,
      ),
    ];
    if (
      completedMatch.matchType === "cross_guild" &&
      completedMatch.opponentChannelId &&
      completedMatch.opponentMessageId
    ) {
      editResults.push(
        await editPublicMessage(
          rest,
          completedMatch.opponentChannelId,
          completedMatch.opponentMessageId,
          publicPayload,
        ),
      );
    }

    if (editResults.some((result) => result.isErr())) {
      await interaction.editReply(
        buildTeamReply({
          title: "Results saved with warning",
          message: "Saved the results, but couldn't update every public match message.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    const affectedGuildIds = await listGuildIdsForPlayerIds(
      env.Database,
      completedMatch.players.map((player) => player.playerId),
    );
    await deleteGuildRosterCaches(env.Cache, [
      completedMatch.guildId,
      ...(completedMatch.opponentGuildId ? [completedMatch.opponentGuildId] : []),
      ...affectedGuildIds,
    ]);
    await interaction.editReply(
      buildTeamReply({
        title: "Results saved",
        message: "Saved match results and updated the public match message.",
        tone: "success",
        emojiName: "confirm",
        emojis,
      }),
    );
  },
);
