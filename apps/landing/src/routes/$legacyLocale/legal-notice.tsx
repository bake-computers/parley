import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$legacyLocale/legal-notice")({
  beforeLoad: () => {
    throw redirect({ to: "/legal-notice", replace: true });
  },
});