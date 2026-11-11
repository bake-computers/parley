import { describe, expect, test } from "vite-plus/test";
import { formatTournamentMemberName, mergeTournamentMembers } from "./members.js";

describe("formatTournamentMemberName", () => {
  test("shows discord name with r6 username when they differ", () => {
    expect(formatTournamentMemberName("player_one", "SamplePlayer")).toBe(
      "player_one (SamplePlayer)",
    );
  });

  test("omits duplicate game tag when names match case-insensitively", () => {
    expect(formatTournamentMemberName("SamplePlayer", "sampleplayer")).toBe("SamplePlayer");
  });

  test("falls back to the game username when discord is empty", () => {
    expect(formatTournamentMemberName("  ", "SamplePlayer")).toBe("SamplePlayer");
  });
});

describe("mergeTournamentMembers", () => {
  test("keeps only linked players and prefers discord avatar/name", () => {
    const merged = mergeTournamentMembers(
      [
        { discordUserId: "1", username: "SamplePlayer" },
        { discordUserId: "2", username: "OtherR6" },
      ],
      [
        {
          id: "1",
          name: "player_one",
          avatarUrl: "https://cdn.discordapp.com/avatars/1/abc.png?size=128",
        },
        {
          id: "99",
          name: "unlinked",
          avatarUrl: "https://cdn.discordapp.com/embed/avatars/0.png",
        },
      ],
    );

    expect(merged).toEqual([
      {
        id: "2",
        name: "OtherR6",
        avatarUrl: "https://cdn.discordapp.com/embed/avatars/2.png",
      },
      {
        id: "1",
        name: "player_one (SamplePlayer)",
        avatarUrl: "https://cdn.discordapp.com/avatars/1/abc.png?size=128",
      },
    ]);
  });
});
