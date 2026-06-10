import { ShieldOff, ScaleIcon, UserX } from "lucide-react";
import { CountUp } from "#/components/ui/count-up";
import { Reveal, RevealStagger } from "#/components/ui/reveal";
import { SectionBackdrop } from "#/components/ui/section-backdrop";

const symptoms = [
  {
    index: "01",
    icon: ShieldOff,
    title: "Lopsided lobbies",
    body: "Public queues throw mismatched skill levels together. Stomps and blowouts replace the close, high-stakes rounds you actually want.",
  },
  {
    index: "02",
    icon: UserX,
    title: "Unreliable teammates",
    body: "Leavers, throwers, and silent fills wreck games before they start. There's no accountability and no structure behind the match.",
  },
  {
    index: "03",
    icon: ScaleIcon,
    title: "No real balance",
    body: "Standard matchmaking ignores how you actually play. Without telemetry, 'fair' is a guess — and the experience suffers for it.",
  },
];

export function Problem() {
  return (
    <section id="problem" className="relative overflow-hidden border-b border-border/60">
      <SectionBackdrop glow="left" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:grid-cols-[0.9fr_1.1fr] md:gap-16 md:py-28">
        <Reveal direction="left" className="md:sticky md:top-24 md:self-start">
          <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-[#c0c5ce]">
            <span
              className="h-px w-6 origin-left bg-[#c0c5ce] parley-line-grow"
              aria-hidden="true"
            />
            Queue Report
          </span>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            The ranked grind is <span className="text-[#c0c5ce]">broken by design.</span>
          </h2>
          <p className="mt-5 max-w-md text-pretty leading-relaxed text-muted-foreground">
            Take Siege seriously and the default experience fights you every match. Here&apos;s a
            breakdown of what public matchmaking actually costs you.
          </p>

          <div className="mt-8 flex items-baseline gap-4 border-t border-border/60 pt-6">
            <CountUp target={3} className="font-mono text-4xl font-semibold text-foreground" />
            <span className="text-sm leading-snug text-muted-foreground">
              recurring failures Parley is built to eliminate — before the Discord app even
              launches.
            </span>
          </div>
        </Reveal>

        <RevealStagger as="ul" itemAs="li" className="flex flex-col">
          {symptoms.map((item) => (
            <div
              key={item.title}
              className="group flex gap-6 border-t border-border/60 py-7 first:border-t-0 first:pt-0 md:py-8 md:first:pt-0"
            >
              <span className="font-mono text-sm leading-none text-muted-foreground/60 transition-colors group-hover:text-[#c0c5ce]">
                {item.index}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <div className="parley-icon-pop flex size-8 shrink-0 items-center justify-center border border-border/70 bg-secondary/40">
                    <item.icon className="size-4 text-[#c0c5ce]" aria-hidden="true" />
                  </div>
                  <h3 className="text-lg font-medium text-foreground">{item.title}</h3>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                <span
                  className="mt-5 block h-px w-0 bg-[#c0c5ce] transition-all duration-500 ease-out group-hover:w-full"
                  aria-hidden="true"
                />
              </div>
            </div>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}
