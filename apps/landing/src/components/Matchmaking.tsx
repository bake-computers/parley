"use client";

import { Activity, Crosshair, GitCompareArrows } from "lucide-react";
import { HeroLobbyDemo } from "#/components/HeroLobbyDemo";
import { Reveal } from "#/components/ui/reveal";

const points = [
  {
    icon: Crosshair,
    title: "Built on real performance",
    body: "Aim, impact, clutch rate, and role consistency feed the rating, not just win/loss.",
  },
  {
    icon: GitCompareArrows,
    title: "Balanced both sides",
    body: "Teams are assembled to minimize skill gaps so rounds stay close and earned.",
  },
  {
    icon: Activity,
    title: "Always adapting",
    body: "Ratings update as you play. Improve and your matches climb with you.",
  },
];

export function Matchmaking() {
  return (
    <div className="grid w-full gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <Reveal direction="left">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Matchmaking driven by skill and telemetry.
        </h2>
        <p className="mt-4 max-w-md text-pretty text-muted-foreground">
          Parley models how you actually perform and builds balanced teams that make every round
          count.
        </p>

        <ol className="mt-8 space-y-5">
          {points.map((point, index) => (
            <li key={point.title} className="flex gap-4">
              <span className="font-mono text-sm text-accent-silver/80">0{index + 1}</span>
              <div>
                <div className="flex items-center gap-2">
                  <point.icon className="size-4 text-accent-silver" aria-hidden="true" />
                  <h3 className="font-medium text-foreground">{point.title}</h3>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{point.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>

      <Reveal direction="right" delay={120}>
        <HeroLobbyDemo />
      </Reveal>
    </div>
  );
}