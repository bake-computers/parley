"use client";

import type { RefObject } from "react";
import { MessageCircle, Bell } from "lucide-react";
import { useInView } from "#/hooks/useInView";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
import { cn } from "#/lib/utils";

const DISCORD_URL = "https://discord.gg/parley";

export function DiscordCta() {
  const { ref, inView } = useInView();

  return (
    <section id="discord" className="relative overflow-hidden py-24 md:py-32">
      <SectionBackdrop glow="center" />

      <div className="relative mx-auto w-full max-w-3xl px-6">
        <GlassPanel className="p-10 text-center md:p-14">
          <Reveal>
            <span className="text-sm font-medium text-muted-foreground">Pre-launch access</span>
          </Reveal>
          <Reveal delay={80}>
            <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
              Join the Discord for launch updates.
            </h2>
          </Reveal>
          <Reveal delay={160}>
            <p className="mx-auto mt-5 max-w-xl text-pretty leading-relaxed text-muted-foreground">
              Parley launches as a Discord app first, with a full web experience and Discord
              backward compatibility to follow. Hop into the server to get notified the moment the
              bot goes live.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <a
                href={DISCORD_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-full bg-foreground px-6 text-sm font-medium whitespace-nowrap text-background transition-all hover:scale-[1.02] active:scale-[0.98]"
              >
                <MessageCircle className="size-4" aria-hidden="true" />
                Join the Discord
              </a>
            </div>
          </Reveal>

          <Reveal delay={320}>
            <div
              ref={ref as RefObject<HTMLDivElement>}
              className="mx-auto mt-10 flex max-w-md items-center justify-center gap-3 rounded-2xl bg-muted/40 px-5 py-4"
            >
              <Bell
                className={cn("size-4 shrink-0 text-accent-silver", inView && "parley-bell-ring")}
                aria-hidden="true"
              />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Launch announcements drop in the server first. No account or signup required.
              </p>
            </div>
          </Reveal>

          <Reveal delay={400}>
            <p className="mt-5 text-xs font-medium text-muted-foreground/60">
              Community updates · Discord app first
            </p>
          </Reveal>
        </GlassPanel>
      </div>
    </section>
  );
}