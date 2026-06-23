import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$legacyLocale/leaderboard")({
  beforeLoad: () => {
    throw redirect({ to: "/leaderboard", replace: true });
  },
});