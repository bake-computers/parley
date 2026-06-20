"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Reveal } from "#/components/ui/reveal";
import { cn } from "#/lib/utils";

const faqs = [
  {
    q: "Is Parley live yet?",
    a: "Not yet. Parley is in pre-launch. Join the Discord to be notified the moment the app goes live.",
  },
  {
    q: "How will I use Parley at launch?",
    a: "Parley launches as a Discord app first. Queue, form teams, run scrims, and join tournaments directly through Discord.",
  },
  {
    q: "Will there be a web app?",
    a: "Yes. A full web experience is planned after the Discord launch, with backward compatibility for your Discord setup.",
  },
  {
    q: "What makes the matchmaking different?",
    a: "Parley uses real in-game telemetry: aim, impact, role consistency, and recent form, not just win/loss.",
  },
  {
    q: "Does it cost anything to join?",
    a: "No. Joining the Discord is free and only signs you up for launch updates.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <div className="grid w-full gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <Reveal className="lg:sticky lg:top-8 lg:self-start">
        <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Questions, answered.
        </h2>
        <p className="mt-4 max-w-sm text-sm text-muted-foreground">
          Everything you need to know before the Discord app launches.
        </p>
      </Reveal>

      <dl className="divide-y divide-border/40 rounded-2xl bg-muted/20">
        {faqs.map((item, index) => {
          const isOpen = openIndex === index;
          return (
            <div key={item.q}>
              <dt>
                <button
                  type="button"
                  onClick={() => setOpenIndex(isOpen ? null : index)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/30"
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
                  <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
                </div>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}