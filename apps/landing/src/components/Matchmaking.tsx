"use client";

import { Activity, Crosshair, GitCompareArrows } from "lucide-react";
import { HeroLobbyDemo } from "#/components/HeroLobbyDemo";
import { Reveal } from "#/components/ui/reveal";
import { useMessages } from "#/lib/content/messages/use-messages";

const pointIcons = [Crosshair, GitCompareArrows, Activity] as const;

export function Matchmaking() {
  const m = useMessages();
  const mm = m.home.matchmaking;

  return (
    <div className="grid w-full gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <Reveal direction="left">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {mm.title}
        </h2>
        <p className="mt-4 max-w-md text-pretty text-muted-foreground">{mm.subtitle}</p>

        <ol className="mt-8 space-y-5">
          {mm.points.map((point, index) => {
            const Icon = pointIcons[index] ?? Crosshair;
            return (
              <li key={point.title} className="flex gap-4">
                <span className="font-mono text-sm text-accent-silver/80">0{index + 1}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <Icon className="size-4 text-accent-silver" aria-hidden="true" />
                    <h3 className="font-medium text-foreground">{point.title}</h3>
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      </Reveal>

      <Reveal direction="right" delay={120}>
        <HeroLobbyDemo />
      </Reveal>
    </div>
  );
}