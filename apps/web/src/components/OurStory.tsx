import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { founders } from "#/lib/shared/founders";
import { useMessages } from "#/lib/content/messages/use-messages";

export function OurStory() {
  const m = useMessages();
  const s = m.home.story;

  return (
    <div className="relative w-full">
      <div
        className="pointer-events-none absolute left-1/2 top-24 -z-10 h-72 w-[42rem] max-w-[90vw] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--accent-silver)_9%,transparent),transparent)] blur-2xl"
        aria-hidden="true"
      />

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

      <RevealStagger as="ul" itemAs="li" interval={120} className="mt-14 grid gap-4 sm:grid-cols-2">
        {founders.map((founder) => (
          <li
            key={founder.id}
            className="problem-card group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-border/60 bg-muted/25 p-4 transition-colors duration-300 hover:border-accent-silver/35 focus-within:border-accent-silver/35 md:p-5"
          >
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-2xl">
              <div className="problem-spotlight pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />
            </div>
            <div className="size-16 shrink-0 overflow-hidden rounded-xl ring-1 ring-border/60">
              <img
                src={founder.avatarSrc.replace(".webp", "-64.webp")}
                srcSet={`${founder.avatarSrc.replace(".webp", "-64.webp")} 1x, ${founder.avatarSrc.replace(".webp", "-128.webp")} 2x`}
                alt={`${founder.handle} ${s.avatarAlt}`}
                width={64}
                height={64}
                loading="lazy"
                decoding="async"
                className="size-full object-cover"
              />
            </div>
            <div className="relative">
              <p className="font-medium text-foreground">{founder.handle}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {founder.role === "Founder" ? s.founderRole : s.coFounderRole}
              </p>
            </div>
          </li>
        ))}
      </RevealStagger>
    </div>
  );
}
