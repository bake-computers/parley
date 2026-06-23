import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { founders } from "#/lib/shared/founders";
import { useMessages } from "#/lib/content/messages/use-messages";

export function OurStory() {
  const m = useMessages();
  const s = m.home.story;

  return (
    <div className="w-full">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <Reveal direction="left">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {s.titleBefore}
            <span className="italic leading-[1.1] text-accent-silver">{s.titleHighlight}</span>
          </h2>
        </Reveal>

        <RevealStagger as="div" className="space-y-5">
          {s.paragraphs.map((text) => (
            <p key={text} className="text-pretty text-base leading-relaxed text-muted-foreground">
              {text}
            </p>
          ))}
        </RevealStagger>
      </div>

      <Reveal
        delay={160}
        className="mt-10 rounded-2xl border-l-4 border-accent-silver/50 bg-muted/25 px-6 py-5 md:px-8"
      >
        <p className="text-lg leading-relaxed text-foreground/90">{s.pullQuote}</p>
      </Reveal>

      <Reveal delay={240}>
        <ul className="mt-10 -mx-2 flex gap-4 overflow-x-auto px-2 pb-2 snap-x-cards md:mx-0 md:px-0">
          {founders.map((founder) => (
            <li
              key={founder.id}
              className="min-w-[220px] shrink-0 rounded-2xl bg-muted/30 p-4 md:min-w-[240px]"
            >
              <div className="flex items-center gap-4">
                <div className="size-16 shrink-0 overflow-hidden rounded-2xl bg-muted/50">
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
                <div>
                  <p className="font-medium text-foreground">{founder.handle}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {founder.role === "Founder" ? s.founderRole : s.coFounderRole}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}