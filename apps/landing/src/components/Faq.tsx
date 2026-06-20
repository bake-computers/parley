"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Reveal } from "#/components/ui/reveal";
import { cn } from "#/lib/utils";

const faqs = [
  {
    q: "Is Parley live yet?",
    a: "Not yet. Parley is in pre-launch. The Discord app is in development and hasn't been released — join the Discord to be notified the moment it goes live.",
  },
  {
    q: "How will I use Parley at launch?",
    a: "Parley launches as a Discord app first. You'll queue, form teams, run scrims, and join tournaments directly through Discord.",
  },
  {
    q: "Will there be a web app?",
    a: "Yes. A full web experience is planned after the Discord launch, with backward compatibility so your Discord setup keeps working seamlessly.",
  },
  {
    q: "What makes the matchmaking different?",
    a: "Instead of relying on win/loss alone, Parley's engine uses real in-game telemetry — aim, impact, role consistency, and recent form — to build genuinely balanced teams.",
  },
  {
    q: "Does it cost anything to join?",
    a: "No. Joining the Discord is free and only signs you up for launch updates and community announcements.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const toggle = (index: number) => {
    setOpenIndex((current) => (current === index ? null : index));
  };

  return (
    <section id="faq" className="py-20 md:py-28">
      <div className="mx-auto w-full max-w-3xl px-6">
        <Reveal className="text-center">
          <span className="text-sm font-medium text-muted-foreground">FAQ</span>
          <h2 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Questions, answered.
          </h2>
        </Reveal>

        <dl className="mt-12 space-y-3">
          {faqs.map((item, index) => {
            const isOpen = openIndex === index;
            return (
              <Reveal key={item.q} delay={index * 80}>
                <GlassPanel className={cn("overflow-hidden", isOpen && "ring-1 ring-accent-silver/25")}>
                  <dt>
                    <button
                      type="button"
                      onClick={() => toggle(index)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/20"
                    >
                      <span className="text-base font-medium text-foreground">{item.q}</span>
                      <ChevronDown
                        className={cn(
                          "size-4 shrink-0 text-muted-foreground transition-transform duration-300",
                          isOpen && "rotate-180 text-accent-silver",
                        )}
                        aria-hidden="true"
                      />
                    </button>
                  </dt>
                  <dd
                    className={cn(
                      "grid transition-all duration-300 ease-out",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                        {item.a}
                      </p>
                    </div>
                  </dd>
                </GlassPanel>
              </Reveal>
            );
          })}
        </dl>
      </div>
    </section>
  );
}