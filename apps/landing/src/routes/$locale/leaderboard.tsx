import { createFileRoute } from "@tanstack/react-router";
import { LeaderboardPage } from "#/components/LeaderboardPage";

const META = {
  en: {
    title: "Global Leaderboard — Parley",
    description:
      "View the global Rainbow Six Siege top 100 leaderboard on Parley. Rank Points, Elo, and Win Rate standings updated every minute.",
  },
  de: {
    title: "Globale Rangliste — Parley",
    description:
      "Die globale Rainbow-Six-Siege-Top-100-Rangliste auf Parley. Rank Points, Elo und Winrate — minütlich aktualisiert.",
  },
} as const;

export const Route = createFileRoute("/$locale/leaderboard")({
  head: ({ params }) => {
    const locale = params.locale === "de" ? "de" : "en";
    const copy = META[locale];
    return {
      meta: [
        { title: copy.title },
        { name: "description", content: copy.description },
        { property: "og:title", content: copy.title },
        { property: "og:description", content: copy.description },
        { property: "og:type", content: "website" },
        { name: "twitter:title", content: copy.title },
        { name: "twitter:description", content: copy.description },
      ],
    };
  },
  component: LeaderboardRoute,
});

function LeaderboardRoute() {
  return <LeaderboardPage />;
}