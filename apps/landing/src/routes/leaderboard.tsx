import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardPage } from "#/components/LeaderboardPage";

const PAGE_TITLE = "Global Leaderboard — Parley";
const PAGE_DESCRIPTION =
  "View the global Rainbow Six Siege top 100 leaderboard on Parley. Rank Points, Elo, and Win Rate standings updated every minute.";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: PAGE_TITLE },
      { name: "description", content: PAGE_DESCRIPTION },
      { property: "og:title", content: PAGE_TITLE },
      { property: "og:description", content: PAGE_DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: PAGE_TITLE },
      { name: "twitter:description", content: PAGE_DESCRIPTION },
    ],
  }),
  component: LeaderboardRoute,
});

function LeaderboardRoute() {
  return <LeaderboardPage />;
}
