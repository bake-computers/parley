import { useState } from "react";
import { Users, Swords, Trophy } from "lucide-react";
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
    <section id="experience" className="border-b border-border/60">
      <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 py-20 md:grid-cols-[0.9fr_1.1fr] md:py-28">
        <Reveal direction="left" className="md:sticky md:top-24 md:self-start">
          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Experience Parley
          </span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            From queue to trophy — handled for you.
          </h2>
          <p className="mt-4 text-pretty leading-relaxed text-muted-foreground">
            Parley automates the entire competitive loop. Select a step to see what the Discord app
            will handle once it launches.
          </p>

          <div className="mt-8 flex items-center gap-3">
            <div className="h-px flex-1 bg-border/60" />
            <span className="text-[11px] uppercase tracking-widest text-muted-foreground/60">
              Pre-launch preview
            </span>
          </div>
        </Reveal>

        <div className="relative">
          <div
            aria-hidden="true"
            className="absolute bottom-4 left-3 top-4 hidden w-px bg-border/60 md:block"
          >
            <div
              className="w-full bg-[#c0c5ce] transition-[height] duration-500 ease-out motion-reduce:transition-none"
              style={{ height: `${progressPct}%` }}
            />
          </div>

          <ul className="space-y-3 md:pl-8" aria-label="How Parley works">
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
                      "group flex w-full items-start gap-4 border p-5 text-left transition-all duration-300",
                      isActive
                        ? "border-[#c0c5ce]/50 bg-secondary/40"
                        : "border-border/60 bg-background hover:border-border hover:bg-secondary/20",
                    )}
                  >
                    <div
                      className={cn(
                        "parley-icon-pop flex size-11 shrink-0 items-center justify-center border transition-colors",
                        isActive
                          ? "border-[#c0c5ce]/60 bg-[#c0c5ce]/10 parley-icon-pop-active"
                          : "border-border/70 bg-secondary/40",
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-5 transition-colors",
                          isActive
                            ? "text-[#c0c5ce]"
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
                        <span className="text-sm tracking-widest text-muted-foreground/40">
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
                                className="border border-border/60 bg-background px-2.5 py-1 text-[11px] uppercase tracking-wider text-muted-foreground"
                              >
                                {d}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </div>
                  </button>
                </Reveal>
              );
            })}
          </ul>

          <Reveal delay={steps.length * 100}>
            <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground/70 md:pl-8">
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
