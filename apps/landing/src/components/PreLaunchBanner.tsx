"use client";

import { useRouterState } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

const DISCORD_URL = "https://discord.gg/parley";

export function PreLaunchChip({ className }: { className?: string }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const discordHref = pathname === "/" ? "#discord" : DISCORD_URL;
  const isExternal = discordHref.startsWith("http");

  return (
    <a
      href={discordHref}
      {...(isExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      role="status"
      className={cn(
        "glass-chip inline-flex items-center gap-2 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      <span
        className="size-1.5 shrink-0 rounded-full bg-accent-silver parley-balance-pulse"
        aria-hidden="true"
      />
      <span className="hidden sm:inline">Pre-launch — Discord app not live yet</span>
      <span className="sm:hidden">Pre-launch</span>
    </a>
  );
}