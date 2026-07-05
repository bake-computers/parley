"use client";

import { useState } from "react";
import { Users, Swords, Trophy } from "lucide-react";
import { Reveal } from "#/components/ui/reveal";
import { useMessages } from "#/lib/content/messages/use-messages";
import { cn } from "#/lib/shared/cn";

const stepIcons = [Users, Swords, Trophy] as const;

export function Experience() {
  const [active, setActive] = useState(0);
  const m = useMessages();
  const ex = m.home.experience;
  const steps = ex.steps;
  const current = steps[active] ?? steps[0];
  const Icon = stepIcons[active] ?? Users;

  return (
    <div className="w-full">
      <Reveal>
        <h2 className="max-w-xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {ex.title}
        </h2>
      </Reveal>

      <div className="mt-10 grid gap-8 lg:grid-cols-[240px_1fr]">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {steps.map((item, index) => {
            const StepIcon = stepIcons[index] ?? Users;
            const isActive = index === active;
            return (
              <button
                key={item.title}
                type="button"
                onClick={() => setActive(index)}
                aria-pressed={isActive}
                className={cn(
                  "shrink-0 rounded-2xl px-4 py-3 text-left transition-all lg:w-full",
                  isActive
                    ? "bg-accent-silver/15 text-foreground ring-1 ring-accent-silver/25"
                    : "bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                )}
              >
                <div className="flex items-center gap-3">
                  <StepIcon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
              </button>
            );
          })}
        </div>

        <div className="rounded-2xl bg-gradient-to-br from-muted/40 to-background/20 p-6 md:p-8">
          <div className="flex items-start gap-4">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-silver/15">
              <Icon className="size-6 text-accent-silver" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-xl font-medium text-foreground">{current.title}</h3>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
                {current.body}
              </p>
              <ul className="mt-5 flex flex-wrap gap-2">
                {current.detail.map((d) => (
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
          <p className="mt-8 text-xs text-muted-foreground/70">{ex.previewNote}</p>
        </div>
      </div>
    </div>
  );
}
