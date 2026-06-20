import { useState } from "react";
import { Users, Swords, Trophy } from "lucide-react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { cn } from "#/lib/utils";

const steps = [
  {
    id: "formation",
    step: "01",
    icon: Users,
    title: "Automated team formation",
    body: "Queue solo or with friends. Parley assembles balanced rosters around skill and role fit — no captains, no manual sorting, no waiting on org drama.",
    detail: ["Skill + role-fit balancing", "Solo or stack friendly", "No manual captain picks"],
  },
  {
    id: "scrims",
    step: "02",
    icon: Swords,
    title: "Scrims on demand",
    body: "Get matched into structured scrims against evenly-rated teams. Practice sessions are scheduled, slotted, and ready without the endless DMs.",
    detail: ["Evenly-rated opponents", "Auto-scheduled slots", "Zero DM coordination"],
  },
  {
    id: "brackets",
    step: "03",
    icon: Trophy,
    title: "Tournament brackets",
    body: "From seeding to results, brackets run themselves. Parley handles check-ins, matchups, and progression so events stay fair and on time.",
    detail: ["Automatic seeding", "Self-running check-ins", "Live progression"],
  },
];

export function Experience() {
  const [active, setActive] = useState(0);
  const current = steps[active];

  const progressPct = steps.length > 1 ? (active / (steps.length - 1)) * 100 : 0;

  return (
    <section id="experience" className="py-20 md:py-28">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 md:grid-cols-[0.9fr_1.1fr]">
        <Reveal direction="left" className="md:sticky md:top-28 md:self-start">
          <span className="text-sm font-medium text-muted-foreground">Experience Parley</span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            From queue to trophy — handled for you.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Parley automates the entire competitive loop. Select a step to see what the Discord app
            will handle once it launches.
          </p>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 rounded-full bg-border/60" />
            <span className="text-xs font-medium text-muted-foreground/60">Pre-launch preview</span>
          </div>
        </Reveal>

        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute bottom-4 left-5 top-4 hidden w-0.5 rounded-full bg-border/60 md:block"
          >
            <div
              className="w-full rounded-full bg-accent-silver transition-[height] duration-500 ease-out motion-reduce:transition-none"
              style={{ height: `${progressPct}%` }}
            />
          </div>

          <ul className="space-y-3 md:pl-10" aria-label="How Parley works">
            {steps.map((item, index) => {
              const isActive = index === active;
              const Icon = item.icon;
              return (
                <Reveal key={item.id} as="li" delay={index * 100}>
                  <button
                    type="button"
                    onClick={() => setActive(index)}
                    aria-expanded={isActive}
                    className={cn(
                      "group w-full text-left transition-transform duration-300",
                      isActive ? "scale-[1.01]" : "hover:scale-[1.005]",
                    )}
                  >
                    <GlassPanel
                      className={cn(
                        "p-5 transition-colors",
                        isActive && "ring-1 ring-accent-silver/30",
                      )}
                    >
                      <div className="flex items-start gap-4">
                        <div
                          className={cn(
                            "parley-icon-pop flex size-11 shrink-0 items-center justify-center rounded-2xl transition-colors",
                            isActive
                              ? "bg-accent-silver/15 parley-icon-pop-active"
                              : "bg-muted/50",
                          )}
                        >
                          <Icon
                            className={cn(
                              "size-5 transition-colors",
                              isActive
                                ? "text-accent-silver"
                                : "text-muted-foreground group-hover:text-foreground",
                            )}
                            aria-hidden="true"
                          />
                        </div>

                        <div className="flex-1">
                          <div className="flex items-center justify-between gap-4">
                            <h3
                              className={cn(
                                "text-base font-medium transition-colors",
                                isActive
                                  ? "text-foreground"
                                  : "text-muted-foreground group-hover:text-foreground",
                              )}
                            >
                              {item.title}
                            </h3>
                            <span className="font-mono text-sm text-muted-foreground/40">
                              {item.step}
                            </span>
                          </div>

                          <div
                            className={cn(
                              "grid transition-all duration-300 ease-out",
                              isActive
                                ? "mt-3 grid-rows-[1fr] opacity-100"
                                : "grid-rows-[0fr] opacity-0",
                            )}
                          >
                            <div className="overflow-hidden">
                              <p className="text-sm leading-relaxed text-muted-foreground">
                                {item.body}
                              </p>
                              <ul className="mt-4 flex flex-wrap gap-2">
                                {item.detail.map((d) => (
                                  <li
                                    key={d}
                                    className="glass-chip px-3 py-1 text-xs font-medium text-muted-foreground"
                                  >
                                    {d}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </div>
                      </div>
                    </GlassPanel>
                  </button>
                </Reveal>
              );
            })}
          </ul>

          <Reveal delay={steps.length * 100}>
            <p className="mt-6 text-xs leading-relaxed text-muted-foreground/70 md:pl-10">
              Interactive preview of planned functionality. The Discord app is not yet live — join
              the Discord to be notified at launch.
            </p>
          </Reveal>
          <span className="sr-only" aria-live="polite">
            {current.title} selected
          </span>
        </div>
      </div>
    </section>
  );
}