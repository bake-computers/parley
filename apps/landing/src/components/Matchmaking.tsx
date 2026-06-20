"use client";

import type { RefObject } from "react";
import { Activity, Crosshair, GitCompareArrows } from "lucide-react";
import { useInView } from "#/hooks/useInView";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
import { TelemetryBar } from "#/components/ui/telemetry-bar";
import { cn } from "#/lib/utils";

const signals = [
  { label: "Skill rating", value: "Telemetry-weighted" },
  { label: "Role tendencies", value: "Entry · Support · Anchor" },
  { label: "Recent form", value: "Rolling performance" },
  { label: "Consistency", value: "Round-by-round" },
];

const points = [
  {
    icon: Crosshair,
    title: "Built on real performance",
    body: "Our engine reads actual in-game telemetry — not just win/loss. Aim, impact, clutch rate, and role consistency all feed the rating.",
  },
  {
    icon: GitCompareArrows,
    title: "Balanced both sides",
    body: "Teams are assembled to minimize skill gaps across the lobby, so rounds stay close and every match feels earned.",
  },
  {
    icon: Activity,
    title: "Always adapting",
    body: "Ratings update as you play. Improve, and your matches climb with you — no stale ranks or grind-locked tiers.",
  },
];

function TelemetryPanel() {
  const { ref, inView } = useInView();

  return (
    <Reveal direction="right" delay={120} as="div">
      <GlassPanel className="overflow-hidden">
        <div ref={ref as RefObject<HTMLDivElement>}>
          <div className="flex items-center justify-between border-b border-border/40 px-5 py-3">
            <span className="text-sm font-medium text-muted-foreground">Player profile</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span
                className={cn("size-1.5 rounded-full bg-accent-silver", inView && "parley-balance-pulse")}
              />
              Telemetry synced
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 p-4">
            {signals.map((signal, index) => (
              <Reveal
                key={signal.label}
                delay={index * 80}
                as="div"
                className="rounded-2xl bg-muted/30 p-4"
              >
                <p className="text-xs font-medium text-muted-foreground">{signal.label}</p>
                <p className="mt-2 text-sm font-medium text-foreground">{signal.value}</p>
              </Reveal>
            ))}
          </div>
          <div className="space-y-4 border-t border-border/40 p-5">
            <TelemetryBar label="Aim rating" value={82} pct={82} delay={0} />
            <TelemetryBar label="Impact / round" value={74} pct={74} delay={100} />
            <TelemetryBar label="Consistency" value={91} pct={91} delay={200} />
            <p className="pt-2 text-xs leading-relaxed text-muted-foreground/70">
              Illustrative preview. Live profiles populate once the Discord app launches.
            </p>
          </div>
        </div>
      </GlassPanel>
    </Reveal>
  );
}

export function Matchmaking() {
  return (
    <section id="matchmaking" className="relative overflow-hidden py-20 md:py-28">
      <SectionBackdrop glow="right" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-14 px-6 md:grid-cols-2">
        <Reveal direction="left">
          <span className="text-sm font-medium text-muted-foreground">The engine</span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Matchmaking driven by skill and telemetry.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Parley&apos;s custom engine looks past the scoreboard. It models how you actually
            perform and builds balanced, competitive teams that make every round count.
          </p>

          <div className="mt-10 space-y-4">
            {points.map((point, index) => (
              <Reveal key={point.title} delay={index * 100}>
                <GlassPanel className="group flex gap-4 p-4 transition-transform hover:scale-[1.01]">
                  <div className="parley-icon-pop flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted/50">
                    <point.icon className="size-5 text-accent-silver" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-base font-medium text-foreground">{point.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {point.body}
                    </p>
                  </div>
                </GlassPanel>
              </Reveal>
            ))}
          </div>
        </Reveal>

        <TelemetryPanel />
      </div>
    </section>
  );
}