"use client";

import { useRouterState } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

const DISCORD_URL = "https://discord.gg/parley";

export function PreLaunchBanner() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const discordHref = pathname === "/" ? "#discord" : DISCORD_URL;
  const isExternal = discordHref.startsWith("http");

  return (
    <div role="status" className="relative border-b border-border/60 bg-secondary/30">
      <div className="mx-auto flex h-8 max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="size-1.5 shrink-0 rounded-full bg-[#c0c5ce] parley-balance-pulse"
            aria-hidden="true"
          />
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            <span className="hidden sm:inline">
              Parley is in pre-launch — the Discord app is not live yet.
            </span>
            <span className="sm:hidden">Pre-launch — not live yet</span>
          </p>
        </div>

        <a
          href={discordHref}
          {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
          className={cn(
            "shrink-0 font-mono text-[10px] uppercase tracking-[0.18em] text-[#c0c5ce]",
            "transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
          )}
        >
          Join Discord →
        </a>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-px parley-shimmer" aria-hidden="true" />
    </div>
  );
}
