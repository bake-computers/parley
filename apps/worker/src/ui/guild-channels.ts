import { DiscordRestClient } from "@parley/runtime";

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
  const client = new DiscordRestClient(botToken);
  const result = await client.request<ApiChannel[]>("GET", `/guilds/${guildId}/channels`);
  if (result.isErr()) {
    return [];
  }
  const channels = result.value ?? [];
  return channels
    .filter((ch) => ch.type === 0 || ch.type === 5)
    .filter((ch) => typeof ch.id === "string" && typeof ch.name === "string")
    .map((ch) => ({ id: ch.id!, name: ch.name! }))
    .toSorted((a, b) => a.name.localeCompare(b.name));
}
