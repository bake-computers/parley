import type { KVNamespace } from "@cloudflare/workers-types";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentHandler,
  ComponentType,
  DiscordRestClient,
  EmbedBuilder,
  SlashCommand,
  parseCustomId,
} from "@parley/discord-runtime";
import type { WorkerRuntimeEnv } from "../env";
import { enforceCommandCooldown } from "./command-cooldowns";
import { buildComponentsV2Reply, buildNoticeCard } from "./ui";

const HELP_COMPONENT_PREFIX = "help-page";
const HELP_MENTION_CACHE_TTL_SECONDS = 6 * 60 * 60;
const HELP_PAGE_SIZE = 5;
const HELP_BANNER_URL = "https://cdn.parley.bot/parley-banner.png";
const HELP_LOGO_URL = "https://cdn.parley.bot/parley.png";

type HelpEnv = Partial<WorkerRuntimeEnv>;

interface HelpPageDefinition {
  title: string;
  description: string;
  commands: string[];
}

export const HELP_PAGES: HelpPageDefinition[] = [
  {
    title: "Account",
    description: "Link your R6 account and inspect your stats state.",
    commands: ["account register", "account unregister", "account me", "account refresh", "stats"],
  },
  {
    title: "Teaming",
    description: "Build internal teams and manage cross-server queueing.",
    commands: ["team create", "queue start", "queue status", "queue cancel", "ping"],
  },
  {
    title: "Tournaments I",
    description: "Create, browse, inspect, and join public tournaments.",
    commands: [
      "tournament create",
      "tournament browse",
      "tournament view",
      "tournament join",
      "tournament leave",
    ],
  },
  {
    title: "Tournaments II / Admin",
    description: "Run brackets and manage tournament lifecycle actions.",
    commands: [
      "tournament start",
      "tournament cancel",
      "tournament forfeit",
      "limit show",
      "limit set",
    ],
  },
  {
    title: "Utility / Admin",
    description: "Server-wide limits and command discovery.",
    commands: ["limit clear", "help"],
  },
];

export function buildHelpMentionCacheKey(applicationId: string): string {
  return `discord:command-mentions:v1:${applicationId}`;
}

export function buildHelpPageCustomId(page: number): string {
  const params = new URLSearchParams({ page: String(Math.max(0, Math.trunc(page))) });
  return `${HELP_COMPONENT_PREFIX}?${params.toString()}`;
}

export function renderSlashCommandMention(
  commandPath: string,
  commandIds: Readonly<Record<string, string>>,
): string {
  const segments = commandPath.trim().split(/\s+/u);
  const root = segments[0];
  if (!root) {
    return `\`/${commandPath}\``;
  }

  const commandId = commandIds[root];
  if (!commandId) {
    return `\`/${commandPath}\``;
  }

  return `</${commandPath}:${commandId}>`;
}

export function buildRenderedHelpPages(
  commandIds: Readonly<Record<string, string>>,
): Array<{ title: string; description: string; commands: string[] }> {
  return HELP_PAGES.map((page) => ({
    ...page,
    commands: page.commands
      .slice(0, HELP_PAGE_SIZE)
      .map((commandPath) => renderSlashCommandMention(commandPath, commandIds)),
  }));
}

async function readHelpMentionCache(
  cache: KVNamespace | null | undefined,
  applicationId: string,
): Promise<Record<string, string> | null> {
  if (!cache) {
    return null;
  }

  try {
    const raw = await cache.get(buildHelpMentionCacheKey(applicationId), "text");
    return raw ? (JSON.parse(raw) as Record<string, string>) : null;
  } catch {
    return null;
  }
}

async function writeHelpMentionCache(
  cache: KVNamespace | null | undefined,
  applicationId: string,
  commandIds: Readonly<Record<string, string>>,
): Promise<void> {
  if (!cache) {
    return;
  }

  await cache.put(buildHelpMentionCacheKey(applicationId), JSON.stringify(commandIds), {
    expirationTtl: HELP_MENTION_CACHE_TTL_SECONDS,
  });
}

function toCommandIdMap(
  commands: ReadonlyArray<{ id?: string | null; name?: string | null }>,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const command of commands) {
    if (typeof command.name === "string" && typeof command.id === "string") {
      map[command.name] = command.id;
    }
  }
  return map;
}

export async function resolveCommandMentionMap(
  env: HelpEnv,
  applicationId: string,
): Promise<Record<string, string>> {
  const cached = await readHelpMentionCache(env.Cache, applicationId);
  if (cached) {
    return cached;
  }

  const rest = new DiscordRestClient(env.DISCORD_BOT_TOKEN ?? env.DISCORD_TOKEN);
  const result = await rest.listApplicationCommands(applicationId);
  if (result.isErr()) {
    return {};
  }

  const commandIds = toCommandIdMap(result.value);
  await writeHelpMentionCache(env.Cache, applicationId, commandIds);
  return commandIds;
}

function buildHelpPayload(pageIndex: number, commandIds: Readonly<Record<string, string>>) {
  const safeIndex = Math.max(0, Math.min(HELP_PAGES.length - 1, Math.trunc(pageIndex)));
  const page = buildRenderedHelpPages(commandIds)[safeIndex] ?? HELP_PAGES[0]!;
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(buildHelpPageCustomId(safeIndex - 1))
      .setLabel("Previous")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safeIndex === 0),
    new ButtonBuilder()
      .setCustomId(buildHelpPageCustomId(safeIndex + 1))
      .setLabel("Next")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safeIndex >= HELP_PAGES.length - 1),
  );
  const assetRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("Open Banner").setStyle(ButtonStyle.Link).setURL(HELP_BANNER_URL),
    new ButtonBuilder().setLabel("Open Logo").setStyle(ButtonStyle.Link).setURL(HELP_LOGO_URL),
  );

  return {
    ...buildComponentsV2Reply([
      buildNoticeCard({
        title: `Help • ${page.title}`,
        message: page.description,
        tone: "primary",
        emojiName: "information",
        details: [
          `**Commands**\n${page.commands.join("\n")}`,
          `**Page**\n${safeIndex + 1}/${HELP_PAGES.length}`,
        ],
        actionRows: [navRow, assetRow],
      }),
    ]),
    embeds: [
      new EmbedBuilder()
        .setColor(0x1d4ed8)
        .setImage({ url: HELP_BANNER_URL })
        .setThumbnail({ url: HELP_LOGO_URL }),
    ],
  };
}

export const helpCommand = new SlashCommand()
  .setName("help")
  .setDescription("Browse Parley commands")
  .addHandler(async (interaction) => {
    const env = interaction.context.env as HelpEnv;
    const cooldown = await enforceCommandCooldown(env, {
      commandKey: "help",
      userId: interaction.userId,
    });
    if (!cooldown.allowed) {
      await interaction.reply(cooldown.payload, true);
      return;
    }

    const commandIds = await resolveCommandMentionMap(env, interaction.applicationId);
    await interaction.reply(buildHelpPayload(0, commandIds), true);
  });

export const helpPaginationHandler = new ComponentHandler(
  HELP_COMPONENT_PREFIX,
  ComponentType.Button,
).addHandler(async (interaction) => {
  const parsed = parseCustomId(interaction.customId);
  const page = typeof parsed === "string" ? 0 : Number(parsed.params.get("page") ?? "0");
  const env = interaction.context.env as HelpEnv;
  const commandIds = await resolveCommandMentionMap(env, interaction.applicationId);
  await interaction.update(buildHelpPayload(page, commandIds));
});
