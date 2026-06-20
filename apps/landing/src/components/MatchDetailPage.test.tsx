import type React from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MatchDetailPage } from "#/components/MatchDetailPage";
import type { MatchData } from "#/lib/match-cache";

afterEach(() => {
  cleanup();
});

vi.mock("#/components/Header", () => ({
  SiteHeader: () => <div data-testid="site-header" />,
}));
vi.mock("#/components/Footer", () => ({
  SiteFooter: () => <div data-testid="site-footer" />,
}));
vi.mock("#/components/ui/reveal", () => ({
  Reveal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseMatch: MatchData = {
  id: 42,
  guildId: "guild-1",
  channelId: "channel-1",
  status: "completed",
  matchType: "ranked",
  winningTeam: "team_a",
  balanceGap: 50,
  createdAtMs: Date.now() - 3_600_000,
  participants: [
    {
      discordUserId: "user-1",
      playerId: 1,
      username: "Alpha",
      platform: "pc",
      balanceRating: 1500,
      mu: 25,
      phi: 5,
      cpr: 1200,
      team: "team_a",
    },
    {
      discordUserId: "user-2",
      playerId: 2,
      username: "Bravo",
      platform: "pc",
      balanceRating: 1400,
      mu: 24,
      phi: 4,
      cpr: 1100,
      team: "team_b",
    },
    {
      discordUserId: "user-3",
      playerId: 3,
      username: "Charlie",
      platform: "pc",
      balanceRating: 1600,
      mu: 26,
      phi: 3,
      cpr: 1300,
      team: "team_a",
    },
    {
      discordUserId: "user-4",
      playerId: 4,
      username: "Delta",
      platform: "pc",
      balanceRating: 1350,
      mu: 23,
      phi: 6,
      cpr: 1050,
      team: "team_b",
    },
  ],
  publicUuid: "test-uuid",
};

describe("MatchDetailPage", () => {
  test("renders team names and all participant usernames", () => {
    render(<MatchDetailPage match={baseMatch} />);

    expect(screen.getByText("Alpha, Charlie")).toBeTruthy();
    expect(screen.getByText("Bravo, Delta")).toBeTruthy();

    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.getByText("Charlie")).toBeTruthy();
    expect(screen.getByText("Delta")).toBeTruthy();

    expect(screen.getByTestId("site-header")).toBeTruthy();
    expect(screen.getByTestId("site-footer")).toBeTruthy();
  });

  test("shows MVP badge when mvpUserId matches a participant", () => {
    const matchWithMvp: MatchData = { ...baseMatch, mvpUserId: "user-1" };
    render(<MatchDetailPage match={matchWithMvp} />);

    expect(screen.getByText("MVP")).toBeTruthy();
  });

  test("shows no MVP badge when mvpUserId is absent", () => {
    render(<MatchDetailPage match={baseMatch} />);

    expect(screen.queryByText("MVP")).toBeNull();
  });

  test("applies design system tokens in markup", () => {
    const { container } = render(<MatchDetailPage match={baseMatch} />);

    expect(container.querySelector(".glass-panel")).toBeTruthy();
    expect(container.querySelector('[class*="text-accent-silver"]')).toBeTruthy();
  });
});
