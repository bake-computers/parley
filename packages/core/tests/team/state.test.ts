import { describe, expect, test } from "bun:test";
import type { KVNamespace } from "@cloudflare/workers-types";
import {
  deleteTeamDraftState,
  deleteTeamResultSession,
  readTeamDraftState,
  readTeamResultSession,
  writeTeamDraftState,
  writeTeamResultSession,
} from "../../src/team/state";

class FakeKV {
  readonly values = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string): Promise<void> {
    this.values.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.values.delete(key);
  }
}

describe("team state", () => {
  test("draft state roundtrips through KV", async () => {
    const cache = new FakeKV();
    const state = {
      draftId: "draft-1",
      guildId: "guild-1",
      channelId: "channel-1",
      creatorId: "user-1",
      page: 1,
      selectedDiscordUserIds: ["user-1", "user-2"],
      members: [],
    };

    await writeTeamDraftState(cache as unknown as KVNamespace, "draft-1", state);
    await expect(readTeamDraftState(cache as unknown as KVNamespace, "draft-1")).resolves.toEqual(
      state,
    );

    await deleteTeamDraftState(cache as unknown as KVNamespace, "draft-1");
    await expect(
      readTeamDraftState(cache as unknown as KVNamespace, "draft-1"),
    ).resolves.toBeNull();
  });

  test("result session roundtrips through KV", async () => {
    const cache = new FakeKV();
    const state = {
      matchId: 99,
      guildId: "guild-1",
      submitterId: "user-1",
      teamAResults: {
        "user-1": { kills: 8, deaths: 6 },
      },
    };

    await writeTeamResultSession(cache as unknown as KVNamespace, state);
    await expect(readTeamResultSession(cache as unknown as KVNamespace, 99)).resolves.toEqual(
      state,
    );

    await deleteTeamResultSession(cache as unknown as KVNamespace, 99);
    await expect(readTeamResultSession(cache as unknown as KVNamespace, 99)).resolves.toBeNull();
  });
});
