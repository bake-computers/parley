import { createFileRoute, redirect } from "@tanstack/react-router";
import { DEFAULT_LOCALE } from "#/lib/i18n";

export const Route = createFileRoute("/terms")({
  beforeLoad: () => {
    throw redirect({ href: `/${DEFAULT_LOCALE}/terms`, replace: true });
  },
});