"use client";

import { HeroLobbyDemo } from "#/components/HeroLobbyDemo";
import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { SpotlightCard } from "#/components/ui/spotlight-card";
import { useMessages } from "#/lib/content/messages/use-messages";

export function Matchmaking() {
  const m = useMessages();
  const mm = m.home.matchmaking;

  return (
    <div className="w-full">
      <Reveal>
        <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {mm.title}
        </h2>
        <p className="mt-4 max-w-lg text-pretty leading-relaxed text-muted-foreground">
          {mm.subtitle}
        </p>
      </Reveal>

      <Reveal delay={80} className="mt-10 md:mt-12">
        <HeroLobbyDemo />
      </Reveal>

      <RevealStagger
        as="ul"
        itemAs="li"
        interval={100}
        className="mt-6 grid gap-4 md:mt-8 md:grid-cols-3"
      >
        {mm.points.map((point) => (
          <SpotlightCard key={point.title} title={point.title} body={point.body} />
        ))}
      </RevealStagger>
    </div>
  );
}
