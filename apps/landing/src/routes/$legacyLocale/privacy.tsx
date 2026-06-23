import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$legacyLocale/privacy")({
  beforeLoad: () => {
    throw redirect({ to: "/privacy", replace: true });
  },
});