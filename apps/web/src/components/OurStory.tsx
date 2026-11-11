import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { useMessages } from "#/lib/content/messages/use-messages";

export function OurStory() {
  const m = useMessages();
  const s = m.home.story;

  return (
    <div className="relative w-full">
      <div className="grid gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14">
        <Reveal direction="left">
          <h2 className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-foreground md:text-4xl lg:text-[2.75rem]">
            {s.titleBefore}
            <span className="italic leading-[1.1] text-accent-silver">{s.titleHighlight}</span>
          </h2>
        </Reveal>

        <RevealStagger as="div" interval={110} className="flex flex-col gap-5">
          {s.paragraphs.map((text) => (
            <p key={text} className="text-pretty text-base leading-relaxed text-muted-foreground">
              {text}
            </p>
          ))}
        </RevealStagger>
      </div>

      <Reveal delay={120} className="mt-14 md:mt-20">
        <figure className="mx-auto max-w-3xl text-center">
          <span
            className="mx-auto mb-7 block h-10 w-px bg-gradient-to-b from-accent-silver/80 to-transparent"
            aria-hidden="true"
          />
          <blockquote className="text-balance text-2xl font-medium leading-[1.3] tracking-tight text-foreground md:text-3xl lg:text-[2.1rem]">
            {s.pullQuote}
          </blockquote>
        </figure>
      </Reveal>
    </div>
  );
}
