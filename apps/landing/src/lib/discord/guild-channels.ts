const DISCORD_API = "https://discord.com/api/v10";

export type GuildTextChannel = {
  id: string;
  name: string;
};

type ApiChannel = {
  id?: string;
  name?: string;
  type?: number;
};

export async function fetchGuildTextChannels(
  guildId: string,
  botToken: string,
): Promise<GuildTextChannel[]> {
  const res = await fetch(`${DISCORD_API}/guilds/${guildId}/channels`, {
    headers: { Authorization: `Bot ${botToken}` },
  });
  if (!res.ok) {
    return [];
  }
  const channels = (await res.json()) as ApiChannel[];
  return channels
    .filter((ch) => ch.type === 0 || ch.type === 5)
    .filter((ch) => typeof ch.id === "string" && typeof ch.name === "string")
    .map((ch) => ({ id: ch.id!, name: ch.name! }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function formatChannelLabel(channel: GuildTextChannel): string {
  return `#${channel.name}`;
}