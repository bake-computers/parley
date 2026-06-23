import { createFileRoute, redirect } from "@tanstack/react-router";
import { canonicalPathFromLegacyLocale } from "#/lib/content/legacy-locale-redirect";

export const Route = createFileRoute("/$legacyLocale")({
  beforeLoad: ({ params, location }) => {
    const target = canonicalPathFromLegacyLocale(location.pathname);
    if (
      target === null ||
      (params.legacyLocale !== "en" && params.legacyLocale !== "de")
    ) {
      throw redirect({ to: "/", replace: true });
    }
    throw redirect({ href: target, replace: true });
  },
});