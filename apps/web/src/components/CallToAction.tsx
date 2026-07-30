"use client";

import { ArrowRight } from "lucide-react";
import { Reveal } from "#/components/ui/reveal";
import { useMessages } from "#/lib/content/messages/use-messages";

const DISCORD_URL =
  "https://discord.com/oauth2/authorize?client_id=1495122091165618358&permissions=379968&integration_type=0&scope=bot+applications.commands";

const ctaButton =
  "group inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-foreground px-7 text-sm font-medium text-background transition-all hover:scale-[1.02] hover:bg-foreground/90 active:scale-[0.98]";

const ctaArrow = <ArrowRight className="parley-arrow-nudge size-4" aria-hidden="true" />;

export function DiscordCta({ variant = "panel" }: { variant?: "panel" | "band" }) {
  const m = useMessages();

  if (variant === "band") {
    const c = m.home.midCta;
    return (
      <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between sm:gap-10">
        <div className="max-w-xl">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {c.title}
          </h2>
          <p className="mt-3 max-w-md text-pretty text-muted-foreground">{c.body}</p>
        </div>
        <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={ctaButton}>
          {c.button}
          {ctaArrow}
        </a>
      </Reveal>
    );
  }

  const c = m.home.discordCta;
  return (
    <Reveal className="relative overflow-hidden rounded-3xl border border-border/70 px-6 py-12 sm:px-10 md:px-14 md:py-16">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_120%_at_85%_-10%,color-mix(in_srgb,var(--accent-silver)_16%,transparent),transparent_60%)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent-silver/40 to-transparent"
        aria-hidden="true"
      />
      <div className="relative grid gap-10 md:grid-cols-[1.3fr_0.7fr] md:items-center">
        <div>
          <h2 className="max-w-md text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {c.title}
          </h2>
          <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
            {c.body}
          </p>
        </div>
        <div className="flex flex-col gap-5 md:items-end">
          <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className={ctaButton}>
            {c.button}
            {ctaArrow}
          </a>
        </div>
      </div>
    </Reveal>
  );
}
