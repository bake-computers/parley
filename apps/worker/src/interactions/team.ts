import {
  ActionRowBuilder,
  type AppEmojiName,
  type ApplicationEmojiCatalog,
  autocompleteChoice,
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
  SlashCommand,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
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
import {
  createTournament,
  createTournamentEntry,
  deleteTournamentEntry,
  getTournamentBracketMatch,
  getTournamentBracketMatchByCustomMatchId,
  getTournamentEntryForCaptain,
  listUserTournamentIds,
  updateTournament,
  updateTournamentBracketMatch,
  updateTournamentHubMessageId,
  type TournamentBracketMatchRecord,
  type TournamentEntryPlayerRecord,
  type TournamentEntryWithPlayers,
  type TournamentFormat,
  type TournamentRecord,
} from "@parley/db/tournaments";
import { balanceTeams, type TeamCandidate } from "@parley/core/team-balance";
import {
  completeCustomMatch,
  countCompletedMatchesSince,
  createCustomMatch,
  getActiveCrossGuildMatchForGuild,
  getCustomMatch,
  isCustomMatchCaptain,
  updateCustomMatchMessageId,
  validateMatchResults,
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
import {
  advanceTournamentBracketMatch,
  buildTournamentEntrySnapshot,
  formatTournamentAutocompleteLabel,
  getTournamentStatusSnapshot,
  invalidateTournamentCaches,
  listTournamentAutocompleteChoices,
  listBrowsableTournaments,
  listOverdueTournamentStarts,
  normalizeTournamentText,
  readTournamentBracketCache,
  readTournamentSummaryCache,
  refreshTournamentCapacityStatus,
  startTournament,
  validateTournamentJoin,
  writeTournamentBracketCache,
  writeTournamentSummaryCache,
} from "@parley/core/tournament-service";
import type { WorkerRuntimeEnv } from "../env";
import { enforceCommandCooldown } from "./command-cooldowns";
import { buildComponentsV2Reply, buildNoticeCard, COMPONENTS_V2_FLAGS } from "./ui";

const TEAM_DRAFT_PREFIX = "team-draft";
const TEAM_DRAFT_SELECT_PREFIX = "team-draft-select";
const TEAM_DRAFT_ROSTER_SELECT_PREFIX = "team-draft-roster-select";
const TEAM_RESULTS_PREFIX = "team-results";
const TEAM_RESULTS_MODAL_PREFIX = "team-results-modal";
const TEAM_DRAFT_PAGE_SIZE = 25;

type TeamEnv = Partial<WorkerRuntimeEnv> & Partial<DiscordRuntimeEnv>;
type WinningTeam = "A" | "B";
type MatchDisplayPlayer =
  | CustomMatchPlayerRecord
  | MatchmakingQueuePlayerRecord
  | TeamCandidate
  | TournamentEntryPlayerRecord;

function buildDraftButtonCustomId(action: string, draftId: string): string {
  return `${TEAM_DRAFT_PREFIX}/${action}/${draftId}`;
}

function buildDraftRosterSelectCustomId(draftId: string, page: number): string {
  const params = new URLSearchParams({ page: String(Math.max(0, Math.trunc(page))) });
  return `${TEAM_DRAFT_ROSTER_SELECT_PREFIX}/${draftId}?${params.toString()}`;
}

function buildDraftPageButtonCustomId(draftId: string, page: number): string {
  const params = new URLSearchParams({ page: String(Math.max(0, Math.trunc(page))) });
  return `${TEAM_DRAFT_PREFIX}/page/${draftId}?${params.toString()}`;
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

function getDraftSelectionPageCount(memberCount: number): number {
  return Math.max(1, Math.ceil(memberCount / TEAM_DRAFT_PAGE_SIZE));
}

function clampDraftSelectionPage(memberCount: number, page: number): number {
  const maxPage = getDraftSelectionPageCount(memberCount) - 1;
  if (!Number.isFinite(page)) {
    return 0;
  }

  return Math.min(Math.max(Math.trunc(page), 0), maxPage);
}

function getDraftPageMembers(
  members: TeamDraftState["members"],
  page: number,
): TeamDraftState["members"] {
  const safePage = clampDraftSelectionPage(members.length, page);
  const start = safePage * TEAM_DRAFT_PAGE_SIZE;
  return members.slice(start, start + TEAM_DRAFT_PAGE_SIZE);
}

function mergeDraftPageSelection(
  state: TeamDraftState,
  page: number,
  currentPageSelectedIds: readonly string[],
): TeamDraftState {
  const safePage = clampDraftSelectionPage(state.members.length, page);
  const allMemberIds = new Set(state.members.map((member) => member.discordUserId));
  const pageMemberIds = new Set(
    getDraftPageMembers(state.members, safePage).map((member) => member.discordUserId),
  );
  const preservedSelectedIds = state.selectedDiscordUserIds.filter(
    (discordUserId) => allMemberIds.has(discordUserId) && !pageMemberIds.has(discordUserId),
  );
  const nextPageSelectedIds: string[] = [];
  const seen = new Set(preservedSelectedIds);

  for (const discordUserId of currentPageSelectedIds) {
    if (!pageMemberIds.has(discordUserId) || seen.has(discordUserId)) {
      continue;
    }

    seen.add(discordUserId);
    nextPageSelectedIds.push(discordUserId);
  }

  return {
    ...state,
    selectionPage: safePage,
    selectedDiscordUserIds: [...preservedSelectedIds, ...nextPageSelectedIds],
  };
}

function buildDraftState(input: {
  draftId: string;
  guildId: string;
  channelId: string;
  creatorId: string;
  mode: TeamDraftState["mode"];
  tournamentId?: number;
  teamName?: string;
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
    tournamentId: input.tournamentId,
    teamName: input.teamName,
    selectionPage: 0,
    selectedDiscordUserIds: [],
    invalidSelectedDiscordUserIds: [],
    members: input.members,
  };
}

function buildDraftModeLabel(mode: TeamDraftState["mode"]): string {
  switch (mode) {
    case "internal":
      return "Internal custom balance";
    case "matchmaking":
      return "Cross-server 5v5 queue";
    case "tournament":
      return "Tournament team entry";
  }
}

function buildDraftMessage(state: TeamDraftState, emojis?: ApplicationEmojiCatalog | null) {
  const activePage = clampDraftSelectionPage(state.members.length, state.selectionPage);
  const pageCount = getDraftSelectionPageCount(state.members.length);
  const pageMembers = getDraftPageMembers(state.members, activePage);
  const pageMemberIds = new Set(pageMembers.map((member) => member.discordUserId));
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
  const selectedOutsidePageCount = state.selectedDiscordUserIds.filter(
    (discordUserId) => !pageMemberIds.has(discordUserId),
  ).length;
  const currentPageSelectedCount = state.selectedDiscordUserIds.filter((discordUserId) =>
    pageMemberIds.has(discordUserId),
  ).length;
  const rawPageMaxValues = Math.min(
    TEAM_DRAFT_PAGE_SIZE,
    state.maxPlayers - selectedOutsidePageCount + currentPageSelectedCount,
  );
  const selectDisabled = pageMembers.length === 0 || rawPageMaxValues <= 0;
  const select = new StringSelectMenuBuilder()
    .setCustomId(buildDraftRosterSelectCustomId(state.draftId, activePage))
    .setPlaceholder(
      selectDisabled
        ? "Selection limit reached on other pages"
        : `Select up to ${Math.min(rawPageMaxValues, state.maxPlayers)} registered-ready players`,
    )
    .setMinValues(0)
    .setMaxValues(
      Math.max(1, Math.min(pageMembers.length === 0 ? 1 : pageMembers.length, rawPageMaxValues)),
    )
    .setDisabled(selectDisabled);

  for (const member of pageMembers) {
    select.addOptions(
      new StringSelectMenuOptionBuilder()
        .setLabel(member.username)
        .setValue(member.discordUserId)
        .setDescription(
          `${formatPlatformLabel(member.platform)} • Team ELO ${formatBalanceRating(member.balanceRating)}`,
        )
        .setDefault(state.selectedDiscordUserIds.includes(member.discordUserId)),
    );
  }

  const selectRow = new ActionRowBuilder().addComponents(select);
  const buildLabel =
    state.mode === "internal"
      ? "Build Teams"
      : state.mode === "matchmaking"
        ? "Queue Stack"
        : "Join Tournament";
  const buildDisabled =
    state.selectedDiscordUserIds.length < state.minPlayers ||
    state.selectedDiscordUserIds.length > state.maxPlayers;
  const buttons = new ActionRowBuilder();
  if (state.members.length > TEAM_DRAFT_PAGE_SIZE) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(buildDraftPageButtonCustomId(state.draftId, activePage - 1))
        .setLabel("Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activePage === 0),
    );
  }
  buttons.addComponents(
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
  if (state.members.length > TEAM_DRAFT_PAGE_SIZE) {
    buttons.addComponents(
      new ButtonBuilder()
        .setCustomId(buildDraftPageButtonCustomId(state.draftId, activePage + 1))
        .setLabel("Next")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(activePage >= pageCount - 1),
    );
  }

  return buildTeamReply({
    title:
      state.mode === "internal"
        ? "Team draft"
        : state.mode === "matchmaking"
          ? "Matchmaking draft"
          : "Tournament draft",
    message:
      state.mode === "internal"
        ? "Pick registered-ready players, then build balanced teams."
        : state.mode === "matchmaking"
          ? "Pick exactly 5 registered-ready players."
          : "Pick exactly 5 registered-ready players for this tournament entry.",
    tone: "primary",
    emojiName: "home",
    emojis,
    details: [
      `**Mode**\n${buildDraftModeLabel(state.mode)}`,
      ...(state.mode === "tournament" && state.teamName
        ? [`**Team Name**\n${state.teamName}`]
        : []),
      `**Eligible Players**\n${state.members.length}`,
      `**Page**\n${activePage + 1}/${pageCount}`,
      `**Selected**\n${state.selectedDiscordUserIds.length}/${state.maxPlayers}`,
      `**Players**\n${selectedLines}`,
      ...(state.invalidSelectedDiscordUserIds.length > 0 ? [`**Ignored**\n${invalidLines}`] : []),
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

function formatTournamentFormatLabel(format: string): string {
  return format === "double" ? "Double Elimination" : "Single Elimination";
}

function formatTournamentStatusLabel(status: string): string {
  switch (status) {
    case "open":
      return "Open";
    case "full_pending_start":
      return "Full, pending start";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function formatTournamentEntryLine(entry: TournamentEntryWithPlayers): string {
  const seed = typeof entry.seedNumber === "number" ? `#${entry.seedNumber}` : "unseeded";
  return `**${entry.teamName}** (${seed}) - <@${entry.captainDiscordUserId}> - Avg ${formatBalanceRating(entry.stackBalanceAverage)}`;
}

function formatTournamentBracketLine(
  match: TournamentBracketMatchRecord,
  entriesById: ReadonlyMap<number, TournamentEntryWithPlayers>,
): string {
  const entryA =
    typeof match.entryAId === "number" ? entriesById.get(match.entryAId)?.teamName : null;
  const entryB =
    typeof match.entryBId === "number" ? entriesById.get(match.entryBId)?.teamName : null;
  const winner =
    typeof match.winnerEntryId === "number" ? entriesById.get(match.winnerEntryId)?.teamName : null;
  const label =
    match.bracket === "grand_final"
      ? "GF"
      : `${match.bracket === "upper" ? "U" : "L"}R${match.roundNumber}M${match.matchNumber}`;

  return `${label}: ${entryA ?? "TBD"} vs ${entryB ?? "TBD"} (${winner ? `winner ${winner}` : match.status})`;
}

function buildTournamentHubMessage(
  snapshot: NonNullable<Awaited<ReturnType<typeof getTournamentStatusSnapshot>>>,
  emojis?: ApplicationEmojiCatalog | null,
) {
  const entriesById = new Map(snapshot.entries.map((entry) => [entry.id, entry] as const));
  const entryLines =
    snapshot.entries.length > 0
      ? snapshot.entries.map((entry) => formatTournamentEntryLine(entry)).join("\n")
      : "No teams joined yet.";
  const bracketLines =
    snapshot.bracketMatches.length > 0
      ? snapshot.bracketMatches
          .slice(0, 10)
          .map((match) => formatTournamentBracketLine(match, entriesById))
          .join("\n")
      : "Bracket not generated yet.";

  return buildTeamReply({
    title: `Tournament #${snapshot.tournament.id}: ${snapshot.tournament.name}`,
    message:
      snapshot.tournament.status === "completed"
        ? "This tournament has finished."
        : snapshot.tournament.status === "active"
          ? "The bracket is live."
          : "Public cross-server tournament listing.",
    tone:
      snapshot.tournament.status === "completed"
        ? "success"
        : snapshot.tournament.status === "cancelled"
          ? "warning"
          : "primary",
    emojiName:
      snapshot.tournament.status === "completed"
        ? "confirm"
        : snapshot.tournament.status === "cancelled"
          ? "warning"
          : "strong",
    emojis,
    details: [
      `**Format**\n${formatTournamentFormatLabel(snapshot.tournament.format)}`,
      `**Status**\n${formatTournamentStatusLabel(snapshot.tournament.status)}`,
      `**Teams**\n${snapshot.entries.length}/${snapshot.tournament.teamCap}`,
      ...(typeof snapshot.tournament.autoStartAt === "number"
        ? [`**Auto Start**\n${formatRelativeTime(snapshot.tournament.autoStartAt)}`]
        : []),
      `**Entries**\n${entryLines}`,
      `**Bracket**\n${bracketLines}`,
    ],
    ephemeral: false,
  });
}

function buildTournamentBrowseReply(
  tournaments: ReadonlyArray<TournamentRecord>,
  emojis?: ApplicationEmojiCatalog | null,
) {
  const lines =
    tournaments.length > 0
      ? tournaments
          .slice(0, 12)
          .map(
            (tournament) =>
              `#${tournament.id} - **${tournament.name}** - ${formatTournamentFormatLabel(
                tournament.format,
              )} - ${formatTournamentStatusLabel(tournament.status)} - ${tournament.teamCap} teams`,
          )
          .join("\n")
      : "No tournaments matched your filters.";

  return buildTeamReply({
    title: "Tournament browser",
    message: "Searchable public tournaments across servers.",
    tone: "info",
    emojiName: "information",
    emojis,
    details: [`**Results**\n${lines}`],
  });
}

function buildTournamentStatusReply(
  snapshot: NonNullable<Awaited<ReturnType<typeof getTournamentStatusSnapshot>>>,
  emojis?: ApplicationEmojiCatalog | null,
) {
  const entriesById = new Map(snapshot.entries.map((entry) => [entry.id, entry] as const));
  const bracketLines =
    snapshot.bracketMatches.length > 0
      ? snapshot.bracketMatches
          .slice(0, 15)
          .map((match) => formatTournamentBracketLine(match, entriesById))
          .join("\n")
      : "Bracket not generated yet.";

  return buildTeamReply({
    title: `Tournament #${snapshot.tournament.id}`,
    message: snapshot.tournament.name,
    tone: "info",
    emojiName: "strong",
    emojis,
    details: [
      `**Format**\n${formatTournamentFormatLabel(snapshot.tournament.format)}`,
      `**Status**\n${formatTournamentStatusLabel(snapshot.tournament.status)}`,
      `**Teams**\n${snapshot.entries.length}/${snapshot.tournament.teamCap}`,
      ...(typeof snapshot.tournament.autoStartAt === "number"
        ? [`**Auto Start**\n${formatRelativeTime(snapshot.tournament.autoStartAt)}`]
        : []),
      `**Entries**\n${snapshot.entries.map((entry) => formatTournamentEntryLine(entry)).join("\n") || "None"}`,
      `**Bracket**\n${bracketLines}`,
    ],
  });
}

async function loadTournamentStatusSnapshotWithCache(
  env: TeamEnv,
  tournamentId: number,
): Promise<NonNullable<Awaited<ReturnType<typeof getTournamentStatusSnapshot>>> | null> {
  const cachedSummary = await readTournamentSummaryCache(env.Cache, tournamentId);
  const cachedBracket = await readTournamentBracketCache(env.Cache, tournamentId);
  if (cachedSummary && cachedBracket) {
    return {
      tournament: cachedSummary,
      entries: cachedSummary.entries,
      bracketMatches: cachedBracket,
    };
  }

  const snapshot = await getTournamentStatusSnapshot(env.db, tournamentId);
  if (!snapshot) {
    return null;
  }

  await writeTournamentSummaryCache(env.Cache, snapshot.tournament);
  await writeTournamentBracketCache(env.Cache, tournamentId, snapshot.bracketMatches);
  return snapshot;
}

function canManageTournamentSetup(
  raw: unknown,
  tournament: Pick<TournamentRecord, "createdByDiscordUserId" | "createdByGuildId">,
  userId: string,
  guildId: string | undefined,
): boolean {
  if (userId === tournament.createdByDiscordUserId) {
    return true;
  }

  return Boolean(guildId && guildId === tournament.createdByGuildId && isGuildAdmin(raw));
}

function canStartTournamentMatchmaking(
  raw: unknown,
  tournament: Pick<TournamentRecord, "createdByDiscordUserId" | "createdByGuildId">,
  entries: readonly TournamentEntryWithPlayers[],
  userId: string,
  guildId: string | undefined,
): boolean {
  if (canManageTournamentSetup(raw, tournament, userId, guildId)) {
    return true;
  }

  return entries.some((entry) => entry.captainDiscordUserId === userId);
}

async function syncTournamentHubMessage(
  env: TeamEnv,
  tournamentId: number,
  emojis?: ApplicationEmojiCatalog | null,
): Promise<void> {
  const snapshot = await getTournamentStatusSnapshot(env.db, tournamentId);
  if (!snapshot?.tournament.hubMessageId) {
    return;
  }

  await writeTournamentSummaryCache(env.Cache, snapshot.tournament);
  await writeTournamentBracketCache(env.Cache, tournamentId, snapshot.bracketMatches);

  const rest = createRestClient(env);
  await editPublicMessage(
    rest,
    snapshot.tournament.createdByChannelId,
    snapshot.tournament.hubMessageId,
    buildTournamentHubMessage(snapshot, emojis),
  );
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

async function createTournamentMatchForBracketNode(
  env: TeamEnv,
  snapshot: NonNullable<Awaited<ReturnType<typeof getTournamentStatusSnapshot>>>,
  bracketMatch: TournamentBracketMatchRecord,
  emojis?: ApplicationEmojiCatalog | null,
): Promise<void> {
  if (
    !env.db ||
    typeof bracketMatch.entryAId !== "number" ||
    typeof bracketMatch.entryBId !== "number" ||
    bracketMatch.customMatchId !== null ||
    bracketMatch.status !== "ready"
  ) {
    return;
  }

  const entriesById = new Map(snapshot.entries.map((entry) => [entry.id, entry] as const));
  const entryA = entriesById.get(bracketMatch.entryAId);
  const entryB = entriesById.get(bracketMatch.entryBId);
  if (!entryA || !entryB) {
    return;
  }

  const rest = createRestClient(env);
  const pendingPayload = buildPendingMirrorMessage(emojis);
  const entryAMessageResult = await postPublicMessage(rest, entryA.channelId, pendingPayload);
  if (entryAMessageResult.isErr()) {
    return;
  }

  const entryAMessageId = readJsonId(entryAMessageResult.value);
  if (!entryAMessageId) {
    return;
  }

  const entryBMessageResult = await postPublicMessage(rest, entryB.channelId, pendingPayload);
  if (entryBMessageResult.isErr()) {
    await editPublicMessage(
      rest,
      entryA.channelId,
      entryAMessageId,
      buildMirrorFailureMessage(emojis),
    );
    return;
  }

  const entryBMessageId = readJsonId(entryBMessageResult.value);
  if (!entryBMessageId) {
    await editPublicMessage(
      rest,
      entryA.channelId,
      entryAMessageId,
      buildMirrorFailureMessage(emojis),
    );
    return;
  }

  const matchId = await createCustomMatch(env.db, {
    guildId: entryA.guildId,
    channelId: entryA.channelId,
    messageId: entryAMessageId,
    createdByDiscordUserId: entryA.captainDiscordUserId,
    status: "pending_results",
    matchType: "tournament",
    opponentGuildId: entryB.guildId,
    opponentChannelId: entryB.channelId,
    opponentMessageId: entryBMessageId,
    opponentCaptainDiscordUserId: entryB.captainDiscordUserId,
    teamASeedTotal: entryA.players.reduce((total, player) => total + player.seedScore, 0),
    teamBSeedTotal: entryB.players.reduce((total, player) => total + player.seedScore, 0),
    seedGap: Math.abs(
      entryA.players.reduce((total, player) => total + player.seedScore, 0) -
        entryB.players.reduce((total, player) => total + player.seedScore, 0),
    ),
    teamABalanceTotal: entryA.stackBalanceTotal,
    teamBBalanceTotal: entryB.stackBalanceTotal,
    balanceGap: Math.abs(entryA.stackBalanceTotal - entryB.stackBalanceTotal),
    players: [
      ...entryA.players.map((player) => ({
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
      ...entryB.players.map((player) => ({
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

  await updateTournamentBracketMatch(env.db, {
    bracketMatchId: bracketMatch.id,
    customMatchId: matchId,
    status: "pending_results",
  });

  const roundLabel =
    bracketMatch.bracket === "grand_final"
      ? "Grand Final"
      : `${bracketMatch.bracket === "upper" ? "Upper" : "Lower"} Round ${bracketMatch.roundNumber}`;
  const publicPayload = buildPublicMatchMessage({
    title: `${snapshot.tournament.name} • ${roundLabel}`,
    matchId,
    teamA: entryA.players,
    teamB: entryB.players,
    teamABalanceTotal: entryA.stackBalanceTotal,
    teamBBalanceTotal: entryB.stackBalanceTotal,
    balanceGap: Math.abs(entryA.stackBalanceTotal - entryB.stackBalanceTotal),
    showResults: false,
    emojis,
    message: `Tournament match ready: **${entryA.teamName}** vs **${entryB.teamName}**.`,
    extraDetails: [
      `**Bracket Match**\n#${bracketMatch.id}`,
      `**Teams**\n${entryA.teamName} vs ${entryB.teamName}`,
      `**Captains**\n<@${entryA.captainDiscordUserId}> vs <@${entryB.captainDiscordUserId}>`,
    ],
  });

  await editPublicMessage(rest, entryA.channelId, entryAMessageId, publicPayload);
  await editPublicMessage(rest, entryB.channelId, entryBMessageId, publicPayload);
}

async function processTournamentReadyMatches(
  env: TeamEnv,
  snapshot: NonNullable<Awaited<ReturnType<typeof getTournamentStatusSnapshot>>>,
  emojis?: ApplicationEmojiCatalog | null,
): Promise<void> {
  for (const bracketMatch of snapshot.bracketMatches) {
    await createTournamentMatchForBracketNode(env, snapshot, bracketMatch, emojis);
  }

  await invalidateTournamentCaches(env.Cache, snapshot.tournament.id);
  await syncTournamentHubMessage(env, snapshot.tournament.id, emojis);
}

export async function processTournamentAutoStarts(
  env: TeamEnv,
  nowMs = Date.now(),
): Promise<number> {
  const dueTournaments = await listOverdueTournamentStarts(env.db, nowMs);
  for (const tournament of dueTournaments) {
    const startResult = await startTournament(env.db!, tournament.id, nowMs);
    await invalidateTournamentCaches(env.Cache, tournament.id);
    await processTournamentReadyMatches(env, startResult.snapshot);
  }
  return dueTournaments.length;
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
  if (!env.db) {
    await interaction.update(
      buildTeamReply({
        title: "Configuration error",
        message: "Database connection is unavailable.",
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
  const matchId = await createCustomMatch(env.db, {
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

  await updateCustomMatchMessageId(env.db, { matchId, messageId });
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
  if (!env.db) {
    await interaction.update(
      buildTeamReply({
        title: "Configuration error",
        message: "Database connection is unavailable.",
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
  await expireStaleMatchmakingQueues(env.db);

  const activeGuildQueue = await getActiveMatchmakingQueueForGuild(env.db, state.guildId);
  if (activeGuildQueue) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildMatchmakingQueueStatusReply(activeGuildQueue, emojis));
    return;
  }

  const activeCaptainQueue = await getActiveMatchmakingQueueForCaptain(env.db, state.creatorId);
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

  const activeMatch = await getActiveCrossGuildMatchForGuild(env.db, state.guildId);
  if (activeMatch) {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.editReply(buildActiveCrossGuildMatchStatusReply(activeMatch, emojis));
    return;
  }

  const queuedQueues = await listQueuedMatchmakingQueues(env.db);
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
  const queueId = await createMatchmakingQueue(env.db, {
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

  const currentQueue = await getMatchmakingQueue(env.db, queueId);
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

  const opponentQueue = await getMatchmakingQueue(env.db, opponentCandidate.id);
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

  const matchId = await createCustomMatch(env.db, {
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

  await markMatchmakingQueueMatched(env.db, {
    queueId: opponentQueue.id,
    matchId,
  });
  await markMatchmakingQueueMatched(env.db, {
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

async function handleTournamentDraftBuild(
  interaction: Parameters<ReturnType<ComponentHandler["addHandler"]>["execute"]>[0],
  env: TeamEnv,
  state: TeamDraftState,
  draftId: string,
  emojis?: ApplicationEmojiCatalog | null,
) {
  if (!env.db || typeof state.tournamentId !== "number" || !state.teamName) {
    await interaction.update(
      buildTeamReply({
        title: "Configuration error",
        message: "Tournament draft data is missing.",
        tone: "danger",
        emojiName: "warning",
        emojis,
      }),
    );
    return;
  }

  const validation = validateReadyRosterSelection(state.members, state.selectedDiscordUserIds);
  const tournamentSnapshot = await getTournamentStatusSnapshot(env.db, state.tournamentId);
  if (!tournamentSnapshot) {
    await interaction.reply(
      buildTeamReply({
        title: "Tournament missing",
        message: "That tournament no longer exists.",
        tone: "danger",
        emojiName: "cancel",
        emojis,
      }),
      true,
    );
    return;
  }

  const joinValidation = validateTournamentJoin({
    tournament: tournamentSnapshot.tournament,
    existingEntries: tournamentSnapshot.entries,
    teamName: state.teamName,
    captainDiscordUserId: state.creatorId,
    players: validation.players,
  });
  if (!joinValidation.ok) {
    await interaction.reply(
      buildTeamReply({
        title: "Join blocked",
        message: joinValidation.message ?? "This team cannot join the tournament.",
        tone: "warning",
        emojiName: "warning",
        emojis,
      }),
      true,
    );
    return;
  }

  await interaction.deferUpdate();
  const snapshot = buildTournamentEntrySnapshot(validation.players);
  await createTournamentEntry(env.db, {
    tournamentId: state.tournamentId,
    guildId: state.guildId,
    channelId: state.channelId,
    captainDiscordUserId: state.creatorId,
    teamName: state.teamName,
    teamNameNormalized: normalizeTournamentText(state.teamName),
    status: "joined",
    stackBalanceTotal: snapshot.stackBalanceTotal,
    stackBalanceAverage: snapshot.stackBalanceAverage,
    players: toMatchmakingQueuePlayers(validation.players),
  });

  await deleteTeamDraftState(env.Cache, draftId);

  const nextSnapshot = await getTournamentStatusSnapshot(env.db, state.tournamentId);
  if (nextSnapshot) {
    await refreshTournamentCapacityStatus(
      env.db,
      nextSnapshot.tournament,
      nextSnapshot.entries.length,
    );
    await invalidateTournamentCaches(env.Cache, state.tournamentId);
    await syncTournamentHubMessage(env, state.tournamentId, emojis);
  }

  await interaction.editReply(
    buildTeamReply({
      title: "Tournament team joined",
      message: `Registered **${state.teamName}** in tournament #${state.tournamentId}.`,
      tone: "success",
      emojiName: "confirm",
      emojis,
    }),
  );
}

export const teamCommand = new SlashCommand()
  .setName("team")
  .setDescription("Build fair teams from ready registered players")
  .addSubcommand((option) =>
    option.setName("create").setDescription("Build fair teams from ready registered players"),
  )
  .addHandler(handleTeamFamilyCommand);

export const queueCommand = new SlashCommand()
  .setName("queue")
  .setDescription("Queue and manage cross-server 5v5 matchmaking")
  .addSubcommand((option) =>
    option.setName("start").setDescription("Queue a full 5-stack for cross-server matchmaking"),
  )
  .addSubcommand((option) =>
    option.setName("status").setDescription("Show the active queue or cross-server match"),
  )
  .addSubcommand((option) =>
    option.setName("cancel").setDescription("Cancel the active queued 5-stack for this server"),
  )
  .addHandler(handleTeamFamilyCommand);

export const limitCommand = new SlashCommand()
  .setName("limit")
  .setDescription("Manage the guild's recorded-match limit")
  .addSubcommand((option) =>
    option
      .setName("set")
      .setDescription("Set the number of recorded matches allowed per day")
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("matches")
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
  )
  .addHandler(handleTeamFamilyCommand);

export const tournamentCommand = new SlashCommand()
  .setName("tournament")
  .setDescription("Create and join public cross-server tournaments")
  .addSubcommand((option) =>
    option
      .setName("create")
      .setDescription("Create a public tournament listing")
      .addStringOption((stringOption) =>
        stringOption
          .setName("name")
          .setDescription("Tournament name")
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(64),
      )
      .addStringOption((stringOption) =>
        stringOption
          .setName("format")
          .setDescription("Bracket format")
          .setRequired(true)
          .addChoices(
            { name: "Single Elimination", value: "single" },
            { name: "Double Elimination", value: "double" },
          ),
      )
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("teams")
          .setDescription("Total number of teams")
          .setRequired(true)
          .addChoices(
            { name: "4", value: 4 },
            { name: "8", value: 8 },
            { name: "16", value: 16 },
            { name: "32", value: 32 },
          ),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("browse")
      .setDescription("Browse public tournaments")
      .addStringOption((stringOption) =>
        stringOption
          .setName("query")
          .setDescription("Optional name search")
          .setRequired(false)
          .setMinLength(2)
          .setMaxLength(64),
      )
      .addStringOption((stringOption) =>
        stringOption
          .setName("format")
          .setDescription("Optional format filter")
          .setRequired(false)
          .addChoices(
            { name: "Single Elimination", value: "single" },
            { name: "Double Elimination", value: "double" },
          ),
      )
      .addStringOption((stringOption) =>
        stringOption
          .setName("status")
          .setDescription("Optional status filter")
          .setRequired(false)
          .addChoices(
            { name: "Open", value: "open" },
            { name: "Full", value: "full_pending_start" },
            { name: "Active", value: "active" },
          ),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("view")
      .setDescription("Show tournament status and bracket")
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("id")
          .setDescription("Tournament ID")
          .setRequired(true)
          .setMinValue(1)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("join")
      .setDescription("Join a tournament with a 5-player team")
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("id")
          .setDescription("Tournament ID")
          .setRequired(true)
          .setMinValue(1)
          .setAutocomplete(true),
      )
      .addStringOption((stringOption) =>
        stringOption
          .setName("teamname")
          .setDescription("Tournament team name")
          .setRequired(true)
          .setMinLength(2)
          .setMaxLength(64),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("leave")
      .setDescription("Leave a tournament before it starts")
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("id")
          .setDescription("Tournament ID")
          .setRequired(true)
          .setMinValue(1)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("start")
      .setDescription("Start a full tournament")
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("id")
          .setDescription("Tournament ID")
          .setRequired(true)
          .setMinValue(1)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("cancel")
      .setDescription("Cancel a tournament you created")
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("id")
          .setDescription("Tournament ID")
          .setRequired(true)
          .setMinValue(1)
          .setAutocomplete(true),
      ),
  )
  .addSubcommand((option) =>
    option
      .setName("forfeit")
      .setDescription("Resolve a tournament match by forfeit")
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("id")
          .setDescription("Tournament ID")
          .setRequired(true)
          .setMinValue(1)
          .setAutocomplete(true),
      )
      .addIntegerOption((integerOption) =>
        integerOption
          .setName("matchid")
          .setDescription("Tournament bracket match ID")
          .setRequired(true)
          .setMinValue(1),
      )
      .addStringOption((stringOption) =>
        stringOption
          .setName("winner")
          .setDescription("Winning side")
          .setRequired(true)
          .addChoices({ name: "Team A", value: "A" }, { name: "Team B", value: "B" }),
      ),
  )
  .addAutocompleteHandler(async (interaction) => {
    const focused = interaction.options.getFocused();
    if (!focused || focused.name !== "id") {
      await interaction.respond([]);
      return;
    }

    const subcommand = interaction.options.getSubcommand(true);
    const statuses =
      subcommand === "join"
        ? (["open"] as const)
        : subcommand === "leave"
          ? (["open", "full_pending_start"] as const)
          : subcommand === "start"
            ? (["full_pending_start"] as const)
            : subcommand === "cancel"
              ? (["open", "full_pending_start", "active"] as const)
              : subcommand === "forfeit"
                ? (["active"] as const)
                : undefined;
    const env = interaction.context.env as TeamEnv;
    const query = String(focused.value ?? "");
    const ownershipIds =
      subcommand === "cancel"
        ? new Set(
            await listUserTournamentIds(env.db, {
              createdByDiscordUserId: interaction.userId,
              statuses: statuses ? [...statuses] : undefined,
            }),
          )
        : subcommand === "start" || subcommand === "leave"
          ? new Set(
              await listUserTournamentIds(env.db, {
                createdByDiscordUserId: interaction.userId,
                captainDiscordUserId: interaction.userId,
                statuses: statuses ? [...statuses] : undefined,
              }),
            )
          : subcommand === "forfeit"
            ? new Set(
                await listUserTournamentIds(env.db, {
                  captainDiscordUserId: interaction.userId,
                  statuses: statuses ? [...statuses] : undefined,
                }),
              )
            : null;
    const choices = await listTournamentAutocompleteChoices(env.Cache, env.db, {
      query,
      statuses: statuses ? [...statuses] : undefined,
      limit: 25,
    });
    const filteredChoices =
      ownershipIds === null ? choices : choices.filter((choice) => ownershipIds.has(choice.id));

    for (const choice of filteredChoices) {
      const cachedSummary = await readTournamentSummaryCache(env.Cache, choice.id);
      if (cachedSummary) {
        choice.entryCount = cachedSummary.entries.length;
      }
    }

    await interaction.respond(
      filteredChoices.map((choice) =>
        autocompleteChoice(formatTournamentAutocompleteLabel(choice), choice.id),
      ),
    );
  })
  .addHandler(handleTeamFamilyCommand);

async function handleTeamFamilyCommand(
  interaction: Parameters<Parameters<typeof teamCommand.addHandler>[0]>[0],
) {
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
  const commandName = interaction.commandName;
  const subcommand = interaction.options.getSubcommand(true);
  const cooldownKey =
    commandName === "team"
      ? "team.create"
      : commandName === "queue"
        ? subcommand === "status"
          ? "queue.status"
          : subcommand === "cancel"
            ? "queue.cancel"
            : "queue.start"
        : commandName === "limit"
          ? subcommand === "show"
            ? "limit.show"
            : subcommand === "clear"
              ? "limit.clear"
              : "limit.set"
          : subcommand === "browse"
            ? "tournament.browse"
            : subcommand === "create"
              ? "tournament.create"
              : subcommand === "view"
                ? "tournament.view"
                : subcommand === "join"
                  ? "tournament.join"
                  : subcommand === "leave"
                    ? "tournament.leave"
                    : subcommand === "start"
                      ? "tournament.start"
                      : subcommand === "cancel"
                        ? "tournament.cancel"
                        : "tournament.forfeit";
  const cooldown = await enforceCommandCooldown(env, {
    commandKey: cooldownKey,
    userId: interaction.userId,
  });
  if (!cooldown.allowed) {
    await interaction.reply(cooldown.payload, true);
    return;
  }

  if (commandName === "limit") {
    await interaction.deferReply(true);

    if (!env.db) {
      await interaction.editReply(
        buildTeamReply({
          title: "Configuration error",
          message: "Database connection is unavailable.",
          tone: "danger",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    if (subcommand === "show") {
      const limit = await getGuildLimit(env.db, interaction.guildId);
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
      const dailyLimit = interaction.options.getInteger("matches", true)!;
      await upsertGuildLimit(env.db, {
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

    await clearGuildLimit(env.db, interaction.guildId);
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

  if (!env.db) {
    await interaction.reply(
      buildTeamReply({
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

  if (commandName === "tournament") {
    await interaction.deferReply(true);
    await processTournamentAutoStarts(env);

    if (subcommand === "browse") {
      const format = interaction.options.getString("format", false) as TournamentFormat | null;
      const status = interaction.options.getString("status", false);
      const query = interaction.options.getString("query", false);
      const tournaments = await listBrowsableTournaments(env.Cache, env.db, {
        query,
        format,
        statuses: status ? [status as "active" | "full_pending_start" | "open"] : undefined,
      });
      await interaction.editReply(buildTournamentBrowseReply(tournaments, emojis));
      return;
    }

    if (subcommand === "create") {
      const name = interaction.options.getString("name", true)!.trim();
      const format = interaction.options.getString("format", true)! as TournamentFormat;
      const teamCap = interaction.options.getInteger("teams", true)!;
      const tournamentId = await createTournament(env.db, {
        name,
        nameNormalized: normalizeTournamentText(name),
        format,
        teamCap,
        status: "open",
        createdByGuildId: interaction.guildId,
        createdByChannelId: interaction.channelId,
        createdByDiscordUserId: interaction.userId,
      });

      const snapshot = await getTournamentStatusSnapshot(env.db, tournamentId);
      if (snapshot) {
        const publicPayload = buildTournamentHubMessage(snapshot, emojis);
        const rest = createRestClient(env);
        const publicResult = await postPublicMessage(rest, interaction.channelId, publicPayload);
        const messageId = publicResult.isErr() ? null : readJsonId(publicResult.value);
        if (messageId) {
          await updateTournamentHubMessageId(env.db, {
            tournamentId,
            hubMessageId: messageId,
          });
        }
      }

      await invalidateTournamentCaches(env.Cache, tournamentId);
      await interaction.editReply(
        buildTeamReply({
          title: "Tournament created",
          message: `Created public tournament **${name}**.`,
          tone: "success",
          emojiName: "confirm",
          emojis,
          details: [
            `**Tournament**\n#${tournamentId}`,
            `**Format**\n${formatTournamentFormatLabel(format)}`,
            `**Teams**\n${teamCap}`,
          ],
        }),
      );
      return;
    }

    const tournamentId = interaction.options.getInteger("id", true)!;
    const tournamentSnapshot = await loadTournamentStatusSnapshotWithCache(env, tournamentId);
    if (!tournamentSnapshot) {
      await interaction.editReply(
        buildTeamReply({
          title: "Tournament missing",
          message: "That tournament could not be found.",
          tone: "danger",
          emojiName: "cancel",
          emojis,
        }),
      );
      return;
    }

    if (subcommand === "view") {
      await interaction.editReply(buildTournamentStatusReply(tournamentSnapshot, emojis));
      return;
    }

    if (subcommand === "join") {
      if (tournamentSnapshot.tournament.status !== "open") {
        await interaction.editReply(
          buildTeamReply({
            title: "Tournament closed",
            message: "This tournament is not accepting new teams.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      const existingCaptainEntry = await getTournamentEntryForCaptain(
        env.db,
        tournamentId,
        interaction.userId,
      );
      if (existingCaptainEntry) {
        await interaction.editReply(
          buildTeamReply({
            title: "Captain already registered",
            message: "You already captain a team in this tournament.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      const roster = await getOrBuildGuildRoster(env.Cache, env.db, interaction.guildId);
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

      const teamName = interaction.options.getString("teamname", true)!.trim();
      const draftState = buildDraftState({
        draftId: interaction.id,
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        creatorId: interaction.userId,
        mode: "tournament",
        tournamentId,
        teamName,
        members: readyMembers,
      });
      await writeTeamDraftState(env.Cache, interaction.id, draftState);
      await interaction.editReply(buildDraftMessage(draftState, emojis));
      return;
    }

    if (subcommand === "leave") {
      if (
        tournamentSnapshot.tournament.status !== "open" &&
        tournamentSnapshot.tournament.status !== "full_pending_start"
      ) {
        await interaction.editReply(
          buildTeamReply({
            title: "Tournament already started",
            message: "Teams can only leave before the bracket starts.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      let targetEntry =
        tournamentSnapshot.entries.find(
          (entry) => entry.captainDiscordUserId === interaction.userId,
        ) ?? null;
      if (!targetEntry && isGuildAdmin(interaction.raw)) {
        const guildEntries = tournamentSnapshot.entries.filter(
          (entry) => entry.guildId === interaction.guildId,
        );
        targetEntry = guildEntries.length === 1 ? (guildEntries[0] ?? null) : null;
      }

      if (!targetEntry) {
        await interaction.editReply(
          buildTeamReply({
            title: "No removable entry",
            message:
              "You must be that team's captain, or be a guild admin with exactly one team from this server in the tournament.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      await deleteTournamentEntry(env.db, targetEntry.id);
      const nextSnapshot = await getTournamentStatusSnapshot(env.db, tournamentId);
      if (nextSnapshot) {
        await refreshTournamentCapacityStatus(
          env.db,
          nextSnapshot.tournament,
          nextSnapshot.entries.length,
        );
      }
      await invalidateTournamentCaches(env.Cache, tournamentId);
      await syncTournamentHubMessage(env, tournamentId, emojis);
      await interaction.editReply(
        buildTeamReply({
          title: "Tournament team removed",
          message: `Removed **${targetEntry.teamName}** from tournament #${tournamentId}.`,
          tone: "success",
          emojiName: "confirm",
          emojis,
        }),
      );
      return;
    }

    if (subcommand === "start") {
      if (
        !canStartTournamentMatchmaking(
          interaction.raw,
          tournamentSnapshot.tournament,
          tournamentSnapshot.entries,
          interaction.userId,
          interaction.guildId,
        )
      ) {
        await interaction.editReply(
          buildTeamReply({
            title: "Permission required",
            message:
              "Only a participating captain, the tournament creator, or a creator-guild admin can start this tournament.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      if (tournamentSnapshot.tournament.status !== "full_pending_start") {
        await interaction.editReply(
          buildTeamReply({
            title: "Tournament not ready",
            message: "This tournament can only start once all team slots are filled.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      const startResult = await startTournament(env.db, tournamentId);
      await invalidateTournamentCaches(env.Cache, tournamentId);
      await processTournamentReadyMatches(env, startResult.snapshot, emojis);
      await interaction.editReply(
        buildTeamReply({
          title: "Tournament started",
          message: `Started tournament #${tournamentId} and generated the opening bracket.`,
          tone: "success",
          emojiName: "confirm",
          emojis,
        }),
      );
      return;
    }

    if (subcommand === "cancel") {
      if (
        !canManageTournamentSetup(
          interaction.raw,
          tournamentSnapshot.tournament,
          interaction.userId,
          interaction.guildId,
        )
      ) {
        await interaction.editReply(
          buildTeamReply({
            title: "Permission required",
            message: "Only the tournament creator or a creator-guild admin can cancel it.",
            tone: "warning",
            emojiName: "warning",
            emojis,
          }),
        );
        return;
      }

      await updateTournament(env.db, {
        tournamentId,
        status: "cancelled",
      });
      await invalidateTournamentCaches(env.Cache, tournamentId);
      await syncTournamentHubMessage(env, tournamentId, emojis);
      await interaction.editReply(
        buildTeamReply({
          title: "Tournament cancelled",
          message: `Cancelled tournament #${tournamentId}.`,
          tone: "success",
          emojiName: "confirm",
          emojis,
        }),
      );
      return;
    }

    const bracketMatchId = interaction.options.getInteger("matchid", true)!;
    const winnerSide = interaction.options.getString("winner", true);
    const bracketMatch = await getTournamentBracketMatch(env.db, bracketMatchId);
    if (
      !bracketMatch ||
      bracketMatch.tournamentId !== tournamentId ||
      bracketMatch.customMatchId === null ||
      (winnerSide !== "A" && winnerSide !== "B")
    ) {
      await interaction.editReply(
        buildTeamReply({
          title: "Invalid forfeit target",
          message: "That tournament match could not be resolved by forfeit.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    const match = await getCustomMatch(env.db, bracketMatch.customMatchId);
    if (
      !match ||
      !interaction.userId ||
      !canManageMatch(interaction.raw, match, interaction.userId, interaction.guildId)
    ) {
      await interaction.editReply(
        buildTeamReply({
          title: "Permission required",
          message: "Only the participating captains or their guild admins can forfeit this match.",
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
      const limit = await getGuildLimit(env.db, guildId);
      if (!limit) {
        continue;
      }

      const completedToday = await countCompletedMatchesSince(env.db, guildId, startOfUtcDayMs());
      if (completedToday >= limit.dailyMatchLimit) {
        await interaction.editReply(
          buildTeamReply({
            title: "Daily limit reached",
            message:
              "Cannot record this forfeit because one of the participating servers already reached its daily recorded-match limit.",
            tone: "warning",
            emojiName: "timer",
            emojis,
          }),
        );
        return;
      }
    }

    if (typeof bracketMatch.entryAId !== "number" || typeof bracketMatch.entryBId !== "number") {
      await interaction.editReply(
        buildTeamReply({
          title: "Bracket mismatch",
          message: "This bracket match does not have two valid teams assigned.",
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    const winnerEntryId = winnerSide === "A" ? bracketMatch.entryAId : bracketMatch.entryBId;
    const loserEntryId = winnerSide === "A" ? bracketMatch.entryBId : bracketMatch.entryAId;
    await completeCustomMatch(env.db, {
      matchId: match.id,
      winningTeam: winnerSide,
      resolutionType: "forfeit",
    });
    // Fire-and-forget: notify Leaderboard DO about match completion without blocking flow
    try {
      const stub = env.LeaderboardDO?.get(env.LeaderboardDO.idFromName("global"));
      if (stub && typeof stub.fetch === "function") {
        void stub.fetch("https://do/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "MATCH_COMPLETED", matchId: match.id }),
        });
      }
    } catch {
      // Do not let notification failures affect match completion
    }
    const advanceResult = await advanceTournamentBracketMatch(env.db, {
      bracketMatchId: bracketMatch.id,
      winnerEntryId,
      loserEntryId,
      finalStatus: "forfeit",
    });

    const completedMatch = await getCustomMatch(env.db, match.id);
    if (completedMatch) {
      const rest = createRestClient(env);
      const publicPayload = buildPublicMatchMessage({
        title: `${tournamentSnapshot.tournament.name} • Forfeit`,
        matchId: completedMatch.id,
        teamA: completedMatch.players.filter((player) => player.team === "A"),
        teamB: completedMatch.players.filter((player) => player.team === "B"),
        teamABalanceTotal: completedMatch.teamABalanceTotal,
        teamBBalanceTotal: completedMatch.teamBBalanceTotal,
        balanceGap: completedMatch.balanceGap,
        showResults: true,
        emojis,
        message: "This tournament match was resolved by forfeit.",
      });
      await editPublicMessage(
        rest,
        completedMatch.channelId,
        completedMatch.messageId,
        publicPayload,
      );
      if (completedMatch.opponentChannelId && completedMatch.opponentMessageId) {
        await editPublicMessage(
          rest,
          completedMatch.opponentChannelId,
          completedMatch.opponentMessageId,
          publicPayload,
        );
      }
    }

    await invalidateTournamentCaches(env.Cache, tournamentId);
    await processTournamentReadyMatches(env, advanceResult.snapshot, emojis);
    await interaction.editReply(
      buildTeamReply({
        title: "Forfeit recorded",
        message: `Recorded a forfeit for tournament match #${bracketMatchId}.`,
        tone: "success",
        emojiName: "confirm",
        emojis,
      }),
    );
    return;
  }

  if (commandName === "queue") {
    await interaction.deferReply(true);
    await expireStaleMatchmakingQueues(env.db);

    if (subcommand === "status") {
      const activeQueue = await getActiveMatchmakingQueueForGuild(env.db, interaction.guildId);
      if (activeQueue) {
        await interaction.editReply(buildMatchmakingQueueStatusReply(activeQueue, emojis));
        return;
      }

      const activeMatch = await getActiveCrossGuildMatchForGuild(env.db, interaction.guildId);
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
      const activeQueue = await getActiveMatchmakingQueueForGuild(env.db, interaction.guildId);
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

      await cancelMatchmakingQueue(env.db, activeQueue.id);
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

    const activeGuildQueue = await getActiveMatchmakingQueueForGuild(env.db, interaction.guildId);
    if (activeGuildQueue) {
      await interaction.editReply(buildMatchmakingQueueStatusReply(activeGuildQueue, emojis));
      return;
    }

    const activeCaptainQueue = await getActiveMatchmakingQueueForCaptain(
      env.db,
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

    const activeMatch = await getActiveCrossGuildMatchForGuild(env.db, interaction.guildId);
    if (activeMatch) {
      await interaction.editReply(buildActiveCrossGuildMatchStatusReply(activeMatch, emojis));
      return;
    }

    const roster = await getOrBuildGuildRoster(env.Cache, env.db, interaction.guildId);
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

  const roster = await getOrBuildGuildRoster(env.Cache, env.db, interaction.guildId);
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
}

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
        message:
          "This team draft expired. Run `/team create`, `/queue start`, or `/tournament join` again.",
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
      selectionPage: 0,
      selectedDiscordUserIds: [],
      invalidSelectedDiscordUserIds: [],
    };

    await writeTeamDraftState(env.Cache, draftId, nextState);
    await interaction.update(buildDraftMessage(nextState, emojis));
    return;
  }

  if (action === "page") {
    const pageValue = Number(parsed.params.get("page"));
    const nextState: TeamDraftState = {
      ...state,
      selectionPage: clampDraftSelectionPage(state.members.length, pageValue),
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

  if (state.mode === "tournament") {
    await handleTournamentDraftBuild(interaction, env, state, draftId, emojis);
    return;
  }

  await handleInternalDraftBuild(interaction, env, state, draftId, emojis);
});

export const teamDraftRosterSelectHandler = new ComponentHandler(
  TEAM_DRAFT_ROSTER_SELECT_PREFIX,
  ComponentType.StringSelect,
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
        message:
          "This team draft expired. Run `/team create`, `/queue start`, or `/tournament join` again.",
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

  const pageValue = Number(parsed.params.get("page"));
  const nextState = mergeDraftPageSelection(state, pageValue, [
    ...new Set(readSelectedValues(interaction)),
  ]);
  const sanitizedState: TeamDraftState = {
    ...nextState,
    invalidSelectedDiscordUserIds: [],
  };

  await writeTeamDraftState(env.Cache, draftId, sanitizedState);
  await interaction.update(buildDraftMessage(sanitizedState, emojis));
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
        message:
          "This team draft expired. Run `/team create`, `/queue start`, or `/tournament join` again.",
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
  await processTournamentAutoStarts(env);
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

  const match = await getCustomMatch(env.db, matchId);
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
    await processTournamentAutoStarts(env);

    const match = await getCustomMatch(env.db, matchId);
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
      const limit = await getGuildLimit(env.db, guildId);
      if (!limit) {
        continue;
      }

      const completedToday = await countCompletedMatchesSince(env.db, guildId, startOfUtcDayMs());
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

    const antiCheatResult = validateMatchResults(match.players, merged);
    if (antiCheatResult) {
      await interaction.editReply(
        buildTeamReply({
          title: "Result rejected",
          message: antiCheatResult.reason,
          tone: "warning",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    if (!env.db) {
      await interaction.editReply(
        buildTeamReply({
          title: "Configuration error",
          message: "Database connection is unavailable.",
          tone: "danger",
          emojiName: "warning",
          emojis,
        }),
      );
      return;
    }

    await completeCustomMatch(env.db, {
      matchId,
      resultsByDiscordUserId: merged,
      winningTeam: winner,
    });
    // Fire-and-forget: notify Leaderboard DO about match completion without blocking flow
    try {
      const stub = env.LeaderboardDO?.get(env.LeaderboardDO.idFromName("global"));
      if (stub && typeof stub.fetch === "function") {
        void stub.fetch("https://do/notify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "MATCH_COMPLETED", matchId }),
        });
      }
    } catch {
      // Do not let notification failures affect match completion
    }
    await deleteTeamResultSession(env.Cache, matchId);

    let tournamentAdvanceResult: Awaited<ReturnType<typeof advanceTournamentBracketMatch>> | null =
      null;
    if (match.matchType === "tournament") {
      const tournamentBracketMatch = await getTournamentBracketMatchByCustomMatchId(
        env.db,
        matchId,
      );
      if (
        tournamentBracketMatch &&
        typeof tournamentBracketMatch.entryAId === "number" &&
        typeof tournamentBracketMatch.entryBId === "number"
      ) {
        tournamentAdvanceResult = await advanceTournamentBracketMatch(env.db, {
          bracketMatchId: tournamentBracketMatch.id,
          winnerEntryId:
            winner === "A" ? tournamentBracketMatch.entryAId : tournamentBracketMatch.entryBId,
          loserEntryId:
            winner === "A" ? tournamentBracketMatch.entryBId : tournamentBracketMatch.entryAId,
          finalStatus: "completed",
        });
      }
    }

    const completedMatch = await getCustomMatch(env.db, matchId);
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
        completedMatch.matchType === "cross_guild"
          ? "Cross-Server 5v5 Match"
          : completedMatch.matchType === "tournament"
            ? "Tournament Match"
            : "R6 Custom Teams",
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
          : completedMatch.matchType === "tournament"
            ? "Results have been submitted for this tournament match."
            : "Results have been submitted for this match.",
      extraDetails:
        completedMatch.matchType === "cross_guild"
          ? [
              `**Captains**\n${formatCaptainLabel(completedMatch.createdByDiscordUserId)} vs ${formatCaptainLabel(completedMatch.opponentCaptainDiscordUserId)}`,
            ]
          : completedMatch.matchType === "tournament"
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
      env.db,
      completedMatch.players.map((player) => player.playerId),
    );
    await deleteGuildRosterCaches(env.Cache, [
      completedMatch.guildId,
      ...(completedMatch.opponentGuildId ? [completedMatch.opponentGuildId] : []),
      ...affectedGuildIds,
    ]);

    if (match.matchType === "tournament" && tournamentAdvanceResult) {
      await invalidateTournamentCaches(env.Cache, tournamentAdvanceResult.snapshot.tournament.id);
      await processTournamentReadyMatches(env, tournamentAdvanceResult.snapshot, emojis);
    }

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
