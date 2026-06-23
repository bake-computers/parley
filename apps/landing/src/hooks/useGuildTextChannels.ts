import { useEffect, useState } from "react";
import type { GuildTextChannel } from "#/lib/discord/guild-channels";

type State = {
  channels: GuildTextChannel[] | null;
  loading: boolean;
  error: string | null;
};

let cacheGuildId: string | null = null;
let cacheChannels: GuildTextChannel[] | null = null;
let cacheInflight: Promise<GuildTextChannel[]> | null = null;

async function loadGuildChannels(guildId: string): Promise<GuildTextChannel[]> {
  if (cacheGuildId === guildId && cacheChannels) {
    return cacheChannels;
  }
  if (cacheInflight && cacheGuildId === guildId) {
    return cacheInflight;
  }

  cacheGuildId = guildId;
  cacheInflight = fetch(`/api/dashboard/guilds/${guildId}/channels`, { credentials: "include" })
    .then(async (res) => {
      const data = (await res.json()) as { channels?: GuildTextChannel[]; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to load channels");
      }
      return data.channels ?? [];
    })
    .then((channels) => {
      cacheChannels = channels;
      return channels;
    })
    .finally(() => {
      cacheInflight = null;
    });

  return cacheInflight;
}

export function prefetchGuildTextChannels(guildId: string): void {
  void loadGuildChannels(guildId).catch(() => {});
}

export function useGuildTextChannels(guildId: string): State {
  const [channels, setChannels] = useState<GuildTextChannel[] | null>(
    () => (cacheGuildId === guildId ? cacheChannels : null),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    if (cacheGuildId === guildId && cacheChannels) {
      setChannels(cacheChannels);
      return;
    }
    setChannels(null);
    loadGuildChannels(guildId)
      .then((list) => {
        if (!cancelled) {
          setChannels(list);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load channels");
          setChannels([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [guildId]);

  return {
    channels,
    loading: channels === null && !error,
    error,
  };
}