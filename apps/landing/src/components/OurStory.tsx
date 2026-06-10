import { Image } from "@unpic/react";
import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
import { founders } from "#/lib/founders";

const paragraphs = [
  "Parley was founded out of pure frustration. We run a Discord server where all our friends hang out — and every weekend we'd fire up Rainbow Six custom games with ten people.",
  "It was a mess. We'd spend forever trying to build fair teams, and the moment one side was picked, the other side was mad. Same argument, every Saturday.",
  "So we built the tool we wished we had: something that balances teams automatically and ends the drama before the first round starts.",
];

export function OurStory() {
  return (
    <section id="story" className="relative overflow-hidden border-b border-border/60">
      <SectionBackdrop glow="right" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:grid-cols-[0.9fr_1.1fr] md:gap-16 md:py-28">
        <Reveal direction="left" className="md:sticky md:top-24 md:self-start">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#c0c5ce]">
            <span
              className="h-px w-6 origin-left bg-[#c0c5ce] parley-line-grow"
              aria-hidden="true"
            />
            Our Story
          </span>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Born from a friend server that{" "}
            <span className="text-[#c0c5ce]">couldn&apos;t stop fighting over teams.</span>
          </h2>
          <p className="mt-5 max-w-md text-pretty leading-relaxed text-muted-foreground">
            The ranked grind is broken for everyone — but Parley started with ten friends and one
            recurring problem.
          </p>

          <blockquote className="mt-8 border-l-2 border-[#c0c5ce]/60 pl-5">
            <p className="text-sm leading-relaxed text-foreground/90">
              Ten players. Two teams. Forty-five minutes of arguing — every Saturday.
            </p>
          </blockquote>
        </Reveal>

        <div className="flex flex-col gap-10">
          <RevealStagger as="div" className="flex flex-col gap-5">
            {paragraphs.map((text) => (
              <p key={text} className="text-pretty leading-relaxed text-muted-foreground">
                {text}
              </p>
            ))}
          </RevealStagger>

          <Reveal delay={200}>
            <div className="border-t border-border/60 pt-8">
              <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                Built by
              </span>
              <ul className="mt-5 flex flex-col gap-3 sm:flex-row sm:gap-4">
                {founders.map((founder) => (
                  <li
                    key={founder.id}
                    className="group flex flex-1 items-center gap-4 border border-border/60 bg-secondary/20 p-4 transition-colors hover:border-[#c0c5ce]/40 hover:bg-secondary/40"
                  >
                    <div className="parley-icon-pop flex size-16 shrink-0 items-center justify-center overflow-hidden border border-border/70 bg-secondary/40">
                      <Image
                        src={founder.avatarSrc}
                        alt={`${founder.handle} avatar`}
                        width={64}
                        height={64}
                        className="size-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{founder.handle}</p>
                      <p className="mt-0.5 text-xs uppercase tracking-widest text-muted-foreground">
                        {founder.role}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
