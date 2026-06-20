"use client";

import type { RefObject } from "react";
import { MessageCircle, Bell } from "lucide-react";
import { useInView } from "#/hooks/useInView";
import { Reveal } from "#/components/ui/reveal";
import { cn } from "#/lib/utils";

const DISCORD_URL = "https://discord.gg/parley";

export function DiscordCta() {
  const { ref, inView } = useInView();

  return (
    <div className="flex w-full flex-col items-center text-center">
      <Reveal>
        <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
          Join the Discord for launch updates.
        </h2>
      </Reveal>
      <Reveal delay={100}>
        <p className="mx-auto mt-5 max-w-lg text-pretty leading-relaxed text-muted-foreground">
          Parley launches as a Discord app first. Hop into the server to get notified the moment the
          bot goes live.
        </p>
      </Reveal>

      <Reveal delay={200}>
        <a
          href={DISCORD_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-10 inline-flex h-12 items-center justify-center gap-2 rounded-full bg-foreground px-8 text-sm font-medium text-background transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <MessageCircle className="size-4" aria-hidden="true" />
          Join the Discord
        </a>
      </Reveal>

      <Reveal delay={300}>
        <div
          ref={ref as RefObject<HTMLDivElement>}
          className="mt-8 flex max-w-md items-center gap-3 rounded-2xl bg-muted/30 px-5 py-4"
        >
          <Bell
            className={cn("size-4 shrink-0 text-accent-silver", inView && "parley-bell-ring")}
            aria-hidden="true"
          />
          <p className="text-left text-sm text-muted-foreground">
            Launch announcements drop in the server first. No account required.
          </p>
        </div>
      </Reveal>
    </div>
  );
}