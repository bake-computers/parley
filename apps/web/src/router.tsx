import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { NotFound } from "#/components/NotFound";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 30_000,
    defaultNotFoundComponent: NotFound,
  });

  // Deploys atomically swap hashed chunks, so a client holding a cached
  // route chunk imports hashes that no longer exist. Reload once to pick
  // up the fresh HTML; the time gate prevents reload loops on real errors.
  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", (event) => {
      if (!/dynamically imported module/i.test(String(event.reason))) return;
      const lastReload = Number(sessionStorage.getItem("parley:chunk-reload-at") ?? 0);
      if (Date.now() - lastReload < 60_000) return;
      sessionStorage.setItem("parley:chunk-reload-at", String(Date.now()));
      event.preventDefault();
      window.location.reload();
    });
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
