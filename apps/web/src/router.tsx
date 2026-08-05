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

  // Deploys swap content-hashed chunks; edge-cached HTML can still point at
  // deleted hashes. Bust the document cache once (query key misses Workers
  // Cache) then strip the param so the URL stays clean.
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    if (url.searchParams.has("_r")) {
      url.searchParams.delete("_r");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }

    window.addEventListener("unhandledrejection", (event) => {
      // oxlint-disable-next-line require-unicode-regexp
      if (!/dynamically imported module|Importing a module script failed/i.test(String(event.reason))) {
        return;
      }
      const lastReload = Number(sessionStorage.getItem("parley:chunk-reload-at") ?? 0);
      if (Date.now() - lastReload < 60_000) {
        return;
      }
      sessionStorage.setItem("parley:chunk-reload-at", String(Date.now()));
      event.preventDefault();
      const next = new URL(window.location.href);
      next.searchParams.set("_r", String(Date.now()));
      window.location.replace(`${next.pathname}${next.search}${next.hash}`);
    });
  }

  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
