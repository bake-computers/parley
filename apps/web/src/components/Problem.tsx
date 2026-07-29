import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { SpotlightCard } from "#/components/ui/spotlight-card";
import { useMessages } from "#/lib/content/messages/use-messages";

export function Problem() {
  const m = useMessages();
  const p = m.home.problem;

  return (
    <div className="w-full">
      <div className="grid gap-10 md:grid-cols-[0.82fr_1.18fr] md:gap-12 lg:gap-16">
        <Reveal direction="left" className="md:sticky md:top-28 md:self-start">
          <div className="flex gap-5 md:gap-6">
            <span
              className="mt-2 w-px shrink-0 bg-gradient-to-b from-accent-silver/70 via-accent-silver/20 to-transparent"
              aria-hidden="true"
            />
            <div>
              <h2 className="text-balance text-3xl font-semibold leading-[1.08] tracking-tight text-foreground md:text-4xl lg:text-[2.75rem]">
                {p.titleBefore}
                <span className="text-accent-silver">{p.titleHighlight}</span>
              </h2>
              <p className="mt-5 max-w-sm text-pretty leading-relaxed text-muted-foreground">
                {p.subtitle}
              </p>
            </div>
          </div>
        </Reveal>

        <RevealStagger as="ul" itemAs="li" interval={110} className="flex flex-col gap-4">
          {p.symptoms.map((item) => (
            <SpotlightCard key={item.title} title={item.title} body={item.body} />
          ))}
        </RevealStagger>
      </div>
    </div>
  );
}
