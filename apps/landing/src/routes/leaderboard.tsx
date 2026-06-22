import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_LOCALE } from "#/lib/i18n";

export const Route = createFileRoute("/leaderboard")({
  beforeLoad: () => {
    throw redirect({ href: `/${DEFAULT_LOCALE}/leaderboard`, replace: true });
  },
});