import { Activity, Crosshair, GitCompareArrows } from "lucide-react";
import { Reveal } from "#/components/ui/reveal";

const signals = [
  {
    label: "Skill rating",
    value: "Telemetry-weighted",
  },
  {
    label: "Role tendencies",
    value: "Entry · Support · Anchor",
  },
  {
    label: "Recent form",
    value: "Rolling performance",
  },
  {
    label: "Consistency",
    value: "Round-by-round",
  },
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

export function Matchmaking() {
  return (
    <section id="matchmaking" className="border-b border-border/60">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 py-20 md:grid-cols-2 md:py-28">
        <Reveal direction="left">
          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            The Engine
          </span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Matchmaking driven by skill and telemetry.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Parley&apos;s custom engine looks past the scoreboard. It models how you actually
            perform and builds balanced, competitive teams that make every round count.
          </p>

          <div className="mt-10 space-y-6">
            {points.map((point, _i) => (
              <div
                key={point.title}
                className="flex gap-4 transition-transform duration-300 hover:translate-x-1"
              >
                <div className="flex size-10 shrink-0 items-center justify-center border border-border/70 bg-secondary/40">
                  <point.icon className="size-5 text-[#c0c5ce]" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-medium text-foreground">{point.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {point.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        {/* Telemetry panel mock */}
        <Reveal direction="right" delay={120} className="border border-border/60 bg-secondary/20">
          <div className="flex items-center justify-between border-b border-border/60 px-5 py-3">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">
              Player Profile
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="size-1.5 rounded-full bg-[#c0c5ce]" />
              Telemetry synced
            </span>
          </div>
          <div className="grid grid-cols-2 gap-px bg-border/60">
            {signals.map((signal) => (
              <div key={signal.label} className="bg-background p-5">
                <p className="text-[11px] uppercase tracking-widest text-muted-foreground">
                  {signal.label}
                </p>
                <p className="mt-2 text-sm font-medium text-foreground">{signal.value}</p>
              </div>
            ))}
          </div>
          <div className="space-y-4 p-5">
            {[
              { label: "Aim rating", pct: 82 },
              { label: "Impact / round", pct: 74 },
              { label: "Consistency", pct: 91 },
            ].map((bar) => (
              <div key={bar.label}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{bar.label}</span>
                  <span className="text-foreground">{bar.pct}</span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden bg-border/60">
                  <div
                    className="h-full origin-left bg-[#c0c5ce] transition-transform duration-1000 ease-out"
                    style={{ width: `${bar.pct}%` }}
                  />
                </div>
              </div>
            ))}
            <p className="pt-2 text-[11px] leading-relaxed text-muted-foreground/70">
              Illustrative preview. Live profiles populate once the Discord app launches.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
