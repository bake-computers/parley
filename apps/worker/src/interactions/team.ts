import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentHandler,
  ComponentType,
  DiscordRestClient,
  type DiscordRuntimeEnv,
  ModalBuilder,
  ModalHandler,
  PermissionFlagsBits,
  SlashCommand,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  parseCustomId,
} from "@parley/discord-runtime";
import type { WorkerEnv } from "../env";
import { balanceTeams, type TeamCandidate } from "@parley/core/team-balance";
import { listGuildIdsForPlayerIds } from "@parley/db/account-links";
import {
  completeCustomMatch,
  countCompletedMatchesSince,
  createCustomMatch,
  getCustomMatch,
  updateCustomMatchMessageId,
  type CustomMatchPlayerRecord,
} from "@parley/core/custom-matches";
import { getGuildLimit, upsertGuildLimit, clearGuildLimit } from "@parley/db/guild-limits";
import { deleteGuildRosterCaches } from "@parley/core/guild-roster-cache";
import { getOrBuildGuildRoster } from "@parley/core/guild-roster-service";
import {
  deleteTeamDraftState,
  deleteTeamResultSession,
  readTeamDraftState,
  readTeamResultSession,
  writeTeamDraftState,
  writeTeamResultSession,
  type TeamDraftState,
} from "@parley/core/team-state";
import { mergeTeamResults, parsePlayerResultInput } from "@parley/core/team-results";

const TEAM_PAGE_SIZE = 25;
const TEAM_DRAFT_PREFIX = "team-draft";
const TEAM_DRAFT_SELECT_PREFIX = "team-draft-select";
const TEAM_RESULTS_PREFIX = "team-results";
const TEAM_RESULTS_MODAL_PREFIX = "team-results-modal";

type TeamEnv = Partial<WorkerEnv> & Partial<DiscordRuntimeEnv>;
type WinningTeam = "A" | "B";

const EMPTY_SEED_METRICS = {
  rankPoints: 0,
  kdRatio: 0,
  kost: 0,
  kpr: 0,
  headshotPercentage: 0,
  seedScore: 0,
} as const;

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

function renderSelectedSummary(state: TeamDraftState): string {
  if (state.selectedDiscordUserIds.length === 0) {
    return "None";
  }

  const selectedMembers = state.members.filter((member) =>
    state.selectedDiscordUserIds.includes(member.discordUserId),
  );
  return selectedMembers.map((member) => member.username).join(", ");
}

function formatBalanceRating(value: number | null | undefined): string {
  return typeof value === "number" ? String(Math.round(value)) : "pending";
}

function sumSeedScore(players: readonly TeamCandidate[]): number {
  return players.reduce((total, player) => total + player.metrics.seedScore, 0);
}

function buildDraftMessage(state: TeamDraftState) {
  const totalPages = Math.max(1, Math.ceil(state.members.length / TEAM_PAGE_SIZE));
  const activePage = Math.min(Math.max(state.page, 0), totalPages - 1);
  const pageMembers = state.members.slice(
    activePage * TEAM_PAGE_SIZE,
    activePage * TEAM_PAGE_SIZE + TEAM_PAGE_SIZE,
  );
  const selectedOnPage = new Set(
    state.selectedDiscordUserIds.filter((discordUserId) =>
      pageMembers.some((member) => member.discordUserId === discordUserId),
    ),
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId(buildDraftSelectCustomId(state.draftId))
    .setPlaceholder("Select 2-10 ready players")
    .setMinValues(0)
    .setMaxValues(pageMembers.length)
    .setDisabled(pageMembers.length === 0);

  for (const member of pageMembers) {
    const option = new StringSelectMenuOptionBuilder()
      .setLabel(member.username)
      .setValue(member.discordUserId)
      .setDescription(
        `${member.platform.toUpperCase()} • ELO ${formatBalanceRating(member.balanceRating)}`,
      );
    if (selectedOnPage.has(member.discordUserId)) {
      option.setDefault(true);
    }
    select.addOptions(option);
  }

  const selectRow = new ActionRowBuilder().addComponents(select);
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildDraftButtonCustomId("prev", state.draftId))
      .setLabel("Prev")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(activePage === 0),
    new ButtonBuilder()
      .setCustomId(buildDraftButtonCustomId("next", state.draftId))
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(activePage >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(buildDraftButtonCustomId("clear", state.draftId))
      .setLabel("Clear")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(state.selectedDiscordUserIds.length === 0),
    new ButtonBuilder()
      .setCustomId(buildDraftButtonCustomId("build", state.draftId))
      .setLabel("Build Teams")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(
        state.selectedDiscordUserIds.length < 2 || state.selectedDiscordUserIds.length > 10,
      ),
    new ButtonBuilder()
      .setCustomId(buildDraftButtonCustomId("cancel", state.draftId))
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return {
    content:
      `Select 2-10 ready players for this R6 custom.\n` +
      `Selected: **${state.selectedDiscordUserIds.length}/10**\n` +
      `Players: ${renderSelectedSummary(state)}\n` +
      `Page ${activePage + 1}/${totalPages}`,
    components: [selectRow, buttons],
  };
}

function createTeamCandidates(state: TeamDraftState): TeamCandidate[] {
  const membersById = new Map(state.members.map((member) => [member.discordUserId, member]));
  return state.selectedDiscordUserIds.map((discordUserId) => {
    const member = membersById.get(discordUserId);
    if (!member) {
      throw new Error(`Missing roster member for ${discordUserId}`);
    }

    if (member.balanceRating === null) {
      throw new Error(`Missing balance rating for ${member.username}`);
    }

    return {
      discordUserId: member.discordUserId,
      playerId: member.playerId,
      username: member.username,
      platform: member.platform,
      balanceRating: member.balanceRating,
      metrics: member.metrics ?? EMPTY_SEED_METRICS,
    };
  });
}

function buildPublicMatchMessage(
  title: string,
  matchId: number,
  teamA: readonly CustomMatchPlayerRecord[] | readonly TeamCandidate[],
  teamB: readonly CustomMatchPlayerRecord[] | readonly TeamCandidate[],
  teamASeedTotal: number,
  teamBSeedTotal: number,
  seedGap: number,
  showResults = false,
): { content: string; components: ActionRowBuilder[] } {
  const teamALines = teamA.map((player) => {
    const kd =
      "kills" in player && player.kills !== null && player.deaths !== null
        ? ` - ${player.kills}/${player.deaths}`
        : "";
    return `<@${player.discordUserId}> (ELO ${formatBalanceRating(player.balanceRating)})${kd}`;
  });
  const teamBLines = teamB.map((player) => {
    const kd =
      "kills" in player && player.kills !== null && player.deaths !== null
        ? ` - ${player.kills}/${player.deaths}`
        : "";
    return `<@${player.discordUserId}> (ELO ${formatBalanceRating(player.balanceRating)})${kd}`;
  });

  const button = new ButtonBuilder()
    .setCustomId(buildResultsButtonCustomId("enter", matchId))
    .setLabel(showResults ? "Results Submitted" : "Enter Results")
    .setStyle(showResults ? ButtonStyle.Secondary : ButtonStyle.Primary)
    .setDisabled(showResults);

  return {
    content:
      `**${title}**\n` +
      `ELO gap: **${formatBalanceRating(seedGap)}**\n\n` +
      `**Team A** (${formatBalanceRating(teamASeedTotal)})\n${teamALines.join("\n")}\n\n` +
      `**Team B** (${formatBalanceRating(teamBSeedTotal)})\n${teamBLines.join("\n")}`,
    components: [new ActionRowBuilder().addComponents(button)],
  };
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
  match: { createdByDiscordUserId: string },
  userId: string,
): boolean {
  return match.createdByDiscordUserId === userId || isGuildAdmin(raw);
}

export const teamCommand = new SlashCommand()
  .setName("team")
  .setDescription("Create balanced R6 custom teams and manage match limits")
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
  .addHandler(async (interaction) => {
    if (!interaction.guildId || !interaction.channelId || !interaction.userId) {
      await interaction.reply("This command only works in a server.", true);
      return;
    }

    const env = interaction.context.env as TeamEnv;
    const subcommandGroup = interaction.options.getSubcommandGroup(false);
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommandGroup === "limit") {
      await interaction.deferReply(true);

      if (!env.Database) {
        await interaction.editReply("Database binding is missing.");
        return;
      }

      if (subcommand === "show") {
        const limit = await getGuildLimit(env.Database, interaction.guildId);
        await interaction.editReply(
          limit
            ? `This server can record **${limit.dailyMatchLimit}** matches per day.`
            : "This server currently has no daily match limit.",
        );
        return;
      }

      if (!isGuildAdmin(interaction.raw)) {
        await interaction.editReply("Only a server admin can change the daily match limit.");
        return;
      }

      if (subcommand === "set") {
        const dailyLimit = interaction.options.getInteger("matches_per_day", true)!;
        await upsertGuildLimit(env.Database, {
          guildId: interaction.guildId,
          dailyMatchLimit: dailyLimit,
          updatedByDiscordUserId: interaction.userId,
        });
        await interaction.editReply(`Set the daily recorded-match limit to **${dailyLimit}**.`);
        return;
      }

      await clearGuildLimit(env.Database, interaction.guildId);
      await interaction.editReply("Cleared the daily recorded-match limit for this server.");
      return;
    }

    await interaction.deferReply(true);

    const roster = await getOrBuildGuildRoster(env.Cache, env.Database, interaction.guildId);
    const readyMembers = roster.filter((member) => member.ready && member.balanceRating !== null);

    if (readyMembers.length < 2) {
      await interaction.editReply(
        `This server only has **${readyMembers.length}** ready registered players. You need at least 2.`,
      );
      return;
    }

    const draftState: TeamDraftState = {
      draftId: interaction.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      creatorId: interaction.userId,
      page: 0,
      selectedDiscordUserIds: [],
      members: readyMembers,
    };

    await writeTeamDraftState(env.Cache, interaction.id, draftState);
    const message = buildDraftMessage(draftState);
    await interaction.editReply({
      content: message.content,
      components: message.components,
    });
  });

export const teamDraftButtonHandler = new ComponentHandler(
  TEAM_DRAFT_PREFIX,
  ComponentType.Button,
).addHandler(async (interaction) => {
  const parsed = parseCustomId(interaction.customId);
  if (typeof parsed === "string" || parsed.path.length < 3) {
    await interaction.reply("This team draft control is invalid.", true);
    return;
  }

  const [, action, draftId] = parsed.path;
  if (!draftId) {
    await interaction.reply("This team draft expired.", true);
    return;
  }

  const env = interaction.context.env as TeamEnv;
  const state = await readTeamDraftState(env.Cache, draftId);
  if (!state) {
    await interaction.reply("This team draft expired. Run `/team create` again.", true);
    return;
  }

  if (interaction.userId !== state.creatorId) {
    await interaction.reply("Only the draft creator can use these controls.", true);
    return;
  }

  if (action === "cancel") {
    await deleteTeamDraftState(env.Cache, draftId);
    await interaction.update({
      content: "Cancelled this team draft.",
      components: [],
    });
    return;
  }

  if (action === "prev" || action === "next" || action === "clear") {
    const nextState: TeamDraftState = {
      ...state,
      draftId: state.draftId,
      page:
        action === "prev"
          ? Math.max(0, state.page - 1)
          : action === "next"
            ? Math.min(Math.ceil(state.members.length / TEAM_PAGE_SIZE) - 1, state.page + 1)
            : state.page,
      selectedDiscordUserIds: action === "clear" ? [] : state.selectedDiscordUserIds,
    };

    await writeTeamDraftState(env.Cache, draftId, nextState);
    const message = buildDraftMessage(nextState);
    await interaction.update({
      content: message.content,
      components: message.components,
    });
    return;
  }

  if (action !== "build") {
    await interaction.reply("Unknown draft action.", true);
    return;
  }

  if (state.selectedDiscordUserIds.length < 2 || state.selectedDiscordUserIds.length > 10) {
    await interaction.reply("Select between 2 and 10 players before building teams.", true);
    return;
  }

  await interaction.deferUpdate();

  const candidates = createTeamCandidates(state);
  const balanced = balanceTeams(candidates);
  if (!env.Database) {
    await interaction.editReply("Database binding is missing.");
    return;
  }

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
        balanceRating: player.balanceRating,
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
        balanceRating: player.balanceRating,
      })),
    ],
  });

  const publicPayload = buildPublicMatchMessage(
    "R6 Custom Teams",
    matchId,
    balanced.teamA,
    balanced.teamB,
    balanced.teamABalanceTotal,
    balanced.teamBBalanceTotal,
    balanced.balanceGap,
  );
  const rest = createRestClient(env);
  const publicMessageResult = await rest.createChannelMessage(state.channelId, {
    content: publicPayload.content,
    components: publicPayload.components.map((row) => row.toJSON()),
  });

  if (publicMessageResult.isErr()) {
    await interaction.editReply("I couldn't post the team announcement to this channel.");
    return;
  }

  const messageId = readJsonId(publicMessageResult.value);
  if (!messageId) {
    await interaction.editReply("I created the teams but couldn't read the posted message ID.");
    return;
  }

  await updateCustomMatchMessageId(env.Database, { matchId, messageId });
  await deleteTeamDraftState(env.Cache, draftId);
  await interaction.editReply("Posted the teams to this channel.");
});

export const teamDraftSelectHandler = new ComponentHandler(
  TEAM_DRAFT_SELECT_PREFIX,
  ComponentType.StringSelect,
).addHandler(async (interaction) => {
  const parsed = parseCustomId(interaction.customId);
  if (typeof parsed === "string" || parsed.path.length < 2) {
    await interaction.reply("This team draft control is invalid.", true);
    return;
  }

  const draftId = parsed.path[1];
  if (!draftId) {
    await interaction.reply("This team draft expired.", true);
    return;
  }

  const env = interaction.context.env as TeamEnv;
  const state = await readTeamDraftState(env.Cache, draftId);
  if (!state) {
    await interaction.reply("This team draft expired. Run `/team create` again.", true);
    return;
  }

  if (interaction.userId !== state.creatorId) {
    await interaction.reply("Only the draft creator can use these controls.", true);
    return;
  }

  const totalPages = Math.max(1, Math.ceil(state.members.length / TEAM_PAGE_SIZE));
  const activePage = Math.min(Math.max(state.page, 0), totalPages - 1);
  const pageMembers = state.members.slice(
    activePage * TEAM_PAGE_SIZE,
    activePage * TEAM_PAGE_SIZE + TEAM_PAGE_SIZE,
  );
  const pageIds = new Set(pageMembers.map((member) => member.discordUserId));
  const selectedValues = readSelectedValues(interaction);
  const nextSelected = [
    ...state.selectedDiscordUserIds.filter((discordUserId) => !pageIds.has(discordUserId)),
    ...selectedValues,
  ];

  const deduped = [...new Set(nextSelected)];
  if (deduped.length > 10) {
    await interaction.reply("You can only select 10 players.", true);
    return;
  }

  const nextState: TeamDraftState = {
    ...state,
    selectedDiscordUserIds: deduped,
  };

  await writeTeamDraftState(env.Cache, draftId, nextState);
  const message = buildDraftMessage(nextState);
  await interaction.update({
    content: message.content,
    components: message.components,
  });
});

export const teamResultsButtonHandler = new ComponentHandler(
  TEAM_RESULTS_PREFIX,
  ComponentType.Button,
).addHandler(async (interaction) => {
  const parsed = parseCustomId(interaction.customId);
  if (typeof parsed === "string" || parsed.path.length < 3) {
    await interaction.reply("This results control is invalid.", true);
    return;
  }

  const [, action, matchIdValue] = parsed.path;
  const matchId = Number(matchIdValue);
  if (!Number.isInteger(matchId)) {
    await interaction.reply("This match reference is invalid.", true);
    return;
  }

  const env = interaction.context.env as TeamEnv;
  const match = await getCustomMatch(env.Database, matchId);
  if (!match) {
    await interaction.reply("This match no longer exists.", true);
    return;
  }

  if (!interaction.userId || !canManageMatch(interaction.raw, match, interaction.userId)) {
    await interaction.reply("Only the match creator or a server admin can submit results.", true);
    return;
  }

  if (match.status === "completed") {
    await interaction.reply("Results have already been submitted for this match.", true);
    return;
  }

  if (action === "enter") {
    const teamAPlayers = match.players.filter((player) => player.team === "A");
    await interaction.showModal(buildResultModal("A", matchId, teamAPlayers));
    return;
  }

  if (action !== "team-b") {
    await interaction.reply("Unknown results action.", true);
    return;
  }

  const session = await readTeamResultSession(env.Cache, matchId);
  if (!session) {
    await interaction.reply(
      "The Team A results session expired. Start again from the match message.",
      true,
    );
    return;
  }

  if (session.submitterId !== interaction.userId) {
    await interaction.reply("The same person who entered Team A must finish Team B.", true);
    return;
  }

  const winner = parsed.params.get("winner");
  if (winner !== "A" && winner !== "B") {
    await interaction.reply("This results control is missing the winning team.", true);
    return;
  }

  const teamBPlayers = match.players.filter((player) => player.team === "B");
  await interaction.showModal(buildResultModal("B", matchId, teamBPlayers, winner));
});

export const teamResultsModalHandler = new ModalHandler(TEAM_RESULTS_MODAL_PREFIX).addHandler(
  async (interaction) => {
    const parsed = parseCustomId(interaction.customId);
    if (typeof parsed === "string" || parsed.path.length < 2) {
      await interaction.reply("This results form is invalid.", true);
      return;
    }

    const matchId = Number(parsed.path[1]);
    const team = parsed.params.get("team");
    const winner = parsed.params.get("winner");
    if (!Number.isInteger(matchId) || (team !== "A" && team !== "B")) {
      await interaction.reply("This results form is invalid.", true);
      return;
    }

    await interaction.deferReply(true);

    const env = interaction.context.env as TeamEnv;
    const match = await getCustomMatch(env.Database, matchId);
    if (!match) {
      await interaction.editReply("This match no longer exists.");
      return;
    }

    if (!interaction.userId || !canManageMatch(interaction.raw, match, interaction.userId)) {
      await interaction.editReply("Only the match creator or a server admin can submit results.");
      return;
    }

    if (team === "A") {
      const teamAPlayers = match.players.filter((player) => player.team === "A");
      let teamAResults: Map<string, { kills: number; deaths: number }>;
      try {
        teamAResults = parseResultMap(interaction, teamAPlayers);
      } catch (error) {
        await interaction.editReply(
          error instanceof Error ? error.message : "Invalid Team A results.",
        );
        return;
      }
      await writeTeamResultSession(env.Cache, {
        matchId,
        guildId: match.guildId,
        submitterId: interaction.userId,
        teamAResults: Object.fromEntries(teamAResults),
      });
      await interaction.editReply({
        content: "Stored Team A results. Continue with Team B.",
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(buildResultsButtonCustomId("team-b", matchId, "A"))
              .setLabel("Team A Won")
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId(buildResultsButtonCustomId("team-b", matchId, "B"))
              .setLabel("Team B Won")
              .setStyle(ButtonStyle.Primary),
          ),
        ],
      });
      return;
    }

    if (winner !== "A" && winner !== "B") {
      await interaction.editReply("This results form is missing the winning team.");
      return;
    }

    const session = await readTeamResultSession(env.Cache, matchId);
    if (!session) {
      await interaction.editReply(
        "The Team A results session expired. Start again from the match message.",
      );
      return;
    }

    if (session.submitterId !== interaction.userId) {
      await interaction.editReply("The same person who entered Team A must finish Team B.");
      return;
    }

    const limit = await getGuildLimit(env.Database, match.guildId);
    if (limit) {
      const completedToday = await countCompletedMatchesSince(
        env.Database,
        match.guildId,
        startOfUtcDayMs(),
      );
      if (completedToday >= limit.dailyMatchLimit) {
        await interaction.editReply("This server already reached its daily recorded-match limit.");
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
        error instanceof Error ? error.message : "Invalid Team B results.",
      );
      return;
    }
    const merged = mergeTeamResults(teamAResults, teamBResults);

    if (!env.Database) {
      await interaction.editReply("Database binding is missing.");
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
      await interaction.editReply("Saved the results, but couldn't reload the completed match.");
      return;
    }

    const rest = createRestClient(env);
    const publicPayload = buildPublicMatchMessage(
      "R6 Custom Teams",
      completedMatch.id,
      completedMatch.players.filter((player) => player.team === "A"),
      completedMatch.players.filter((player) => player.team === "B"),
      completedMatch.teamABalanceTotal,
      completedMatch.teamBBalanceTotal,
      completedMatch.balanceGap,
      true,
    );
    const editResult = await rest.editChannelMessage(
      completedMatch.channelId,
      completedMatch.messageId,
      {
        content: publicPayload.content,
        components: publicPayload.components.map((row) => row.toJSON()),
      },
    );

    if (editResult.isErr()) {
      await interaction.editReply(
        "Saved the results, but couldn't update the public match message.",
      );
      return;
    }

    const affectedGuildIds = await listGuildIdsForPlayerIds(
      env.Database,
      completedMatch.players.map((player) => player.playerId),
    );
    await deleteGuildRosterCaches(env.Cache, [completedMatch.guildId, ...affectedGuildIds]);
    await interaction.editReply("Saved match results and updated the public match message.");
  },
);
