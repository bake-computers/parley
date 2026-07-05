import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardPage } from "#/components/LeaderboardPage";

const META = {
  title: "Global Leaderboard — Parley",
  description:
    "View the global Rainbow Six Siege top 100 leaderboard on Parley. Rank Points, Elo, and Win Rate standings updated every minute.",
} as const;

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: META.title },
      { name: "description", content: META.description },
      { property: "og:title", content: META.title },
      { property: "og:description", content: META.description },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: META.title },
      { name: "twitter:description", content: META.description },
    ],
  }),
  component: LeaderboardRoute,
});

function LeaderboardRoute() {
  return <LeaderboardPage />;
}
