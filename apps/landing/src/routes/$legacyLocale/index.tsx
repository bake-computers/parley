import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/$legacyLocale/")({
  beforeLoad: () => {
    throw redirect({ to: "/", replace: true });
  },
});