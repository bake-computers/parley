"use client";

import type { RefObject } from "react";
import { Activity, Crosshair, GitCompareArrows } from "lucide-react";
import { useInView } from "#/hooks/useInView";
import { Reveal } from "#/components/ui/reveal";
import { TelemetryBar } from "#/components/ui/telemetry-bar";
import { cn } from "#/lib/utils";

const signals = [
  { label: "Skill rating", value: "Telemetry-weighted" },
  { label: "Role tendencies", value: "Entry, support, anchor" },
  { label: "Recent form", value: "Rolling performance" },
  { label: "Consistency", value: "Round by round" },
];

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

function TelemetryPanel() {
  const { ref, inView } = useInView();

  return (
    <div
      ref={ref as RefObject<HTMLDivElement>}
      className="rounded-2xl bg-gradient-to-b from-muted/50 to-muted/20 p-5 md:p-6"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">Player profile</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <span
            className={cn("size-1.5 rounded-full bg-accent-silver", inView && "parley-balance-pulse")}
          />
          Telemetry synced
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        {signals.map((signal) => (
          <div key={signal.label} className="rounded-xl bg-background/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">{signal.label}</p>
            <p className="mt-1 text-sm font-medium text-foreground">{signal.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-4 border-t border-border/30 pt-5">
        <TelemetryBar label="Aim rating" value={82} pct={82} delay={0} />
        <TelemetryBar label="Impact / round" value={74} pct={74} delay={100} />
        <TelemetryBar label="Consistency" value={91} pct={91} delay={200} />
        <p className="text-xs text-muted-foreground/70">
          Illustrative preview. Live profiles populate at Discord launch.
        </p>
      </div>
    </div>
  );
}

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
        <TelemetryPanel />
      </Reveal>
    </div>
  );
}