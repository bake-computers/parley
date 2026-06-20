import { Image } from "@unpic/react";
import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { founders } from "#/lib/founders";

const paragraphs = [
  "Parley started on a friend Discord where ten of us ran custom Siege every weekend.",
  "We spent forever building teams. One side always felt picked on. Same fight, every Saturday.",
  "So we built the tool we wished we had: automatic balance before the first round starts.",
];

export function OurStory() {
  return (
    <div className="w-full">
      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
        <Reveal direction="left">
          <h2 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Born from a server that{" "}
            <span className="italic text-accent-silver">could not stop arguing over teams.</span>
          </h2>
        </Reveal>

        <RevealStagger as="div" className="space-y-5">
          {paragraphs.map((text) => (
            <p key={text} className="text-pretty text-base leading-relaxed text-muted-foreground">
              {text}
            </p>
          ))}
        </RevealStagger>
      </div>

      <Reveal delay={160} className="mt-10 rounded-2xl border-l-4 border-accent-silver/50 bg-muted/25 px-6 py-5 md:px-8">
        <p className="text-lg leading-relaxed text-foreground/90">
          Ten players. Two teams. Forty-five minutes of arguing, every Saturday.
        </p>
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
                  <p className="mt-0.5 text-xs text-muted-foreground">{founder.role}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Reveal>
    </div>
  );
}