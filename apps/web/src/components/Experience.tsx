"use client";

import { useRef, useState } from "react";
import { Users, Trophy } from "lucide-react";
import { Reveal } from "#/components/ui/reveal";
import { useMessages } from "#/lib/content/messages/use-messages";
import { cn } from "#/lib/shared/cn";

const stepIcons = [Users, Trophy] as const;

export function Experience() {
  const [active, setActive] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const m = useMessages();
  const ex = m.home.experience;
  const steps = ex.steps;
  const current = steps[active] ?? steps[0];

  const setPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const node = panelRef.current;
    if (!node) {
      return;
    }
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    node.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <div className="relative w-full">
      <Reveal>
        <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {ex.title}
        </h2>
      </Reveal>

      <div className="mt-10 grid gap-6 lg:grid-cols-[260px_1fr] lg:gap-8">
        <div
          role="tablist"
          aria-label={ex.title}
          className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible"
        >
          {steps.map((item, index) => {
            const StepIcon = stepIcons[index] ?? Users;
            const isActive = index === active;
            return (
              <button
                key={item.title}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActive(index)}
                className={cn(
                  "group relative shrink-0 overflow-hidden rounded-xl py-3 pl-5 pr-4 text-left transition-colors duration-300 lg:w-full",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute inset-y-2 left-0 w-0.5 origin-top rounded-full transition-transform duration-300 ease-out",
                    isActive ? "scale-y-100" : "scale-y-0",
                  )}
                  aria-hidden="true"
                />
                <span className="flex items-center gap-3">
                  <StepIcon
                    className={cn(
                      "size-4 shrink-0 transition-colors duration-300",
                      isActive ? "text-accent-silver" : "text-muted-foreground/60",
                    )}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{item.title}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div
          ref={panelRef}
          onPointerMove={setPos}
          onPointerEnter={setPos}
          role="tabpanel"
          className="problem-card relative overflow-hidden rounded-2xl border border-border/60 bg-muted/25 p-6 md:p-8"
        >
          <div className="problem-spotlight pointer-events-none absolute inset-0 opacity-70" />
          <span
            key={`rail-${active}`}
            className="parley-panel-rail pointer-events-none absolute inset-y-6 left-0 w-px origin-top bg-gradient-to-b from-accent-silver/70 to-transparent"
            aria-hidden="true"
          />
          <Reveal key={active} className="relative">
            <h3 className="text-xl font-medium tracking-tight text-foreground md:text-2xl">
              {current.title}
            </h3>
            <p className="mt-3 max-w-lg text-pretty leading-relaxed text-muted-foreground">
              {current.body}
            </p>
            <ul className="mt-6 flex flex-wrap gap-2">
              {current.detail.map((d) => (
                <li
                  key={d}
                  className="rounded-full border border-border/60 bg-background/30 px-3 py-1 text-xs font-medium text-muted-foreground"
                >
                  {d}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </div>
    </div>
  );
}
