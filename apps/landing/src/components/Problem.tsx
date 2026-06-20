import { ShieldOff, ScaleIcon, UserX } from "lucide-react";
import { CountUp } from "#/components/ui/count-up";
import { GlassPanel } from "#/components/ui/glass-panel";
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
    <section id="problem" className="relative overflow-hidden py-20 md:py-28">
      <SectionBackdrop glow="left" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 md:grid-cols-[0.9fr_1.1fr] md:gap-16">
        <Reveal direction="left" className="md:sticky md:top-28 md:self-start">
          <span className="inline-flex items-center gap-2 text-sm font-medium text-accent-silver">
            <span
              className="h-px w-6 origin-left rounded-full bg-accent-silver parley-line-grow"
              aria-hidden="true"
            />
            Queue report
          </span>
          <h2 className="mt-5 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            The ranked grind is <span className="text-accent-silver">broken by design.</span>
          </h2>
          <p className="mt-5 max-w-md text-pretty leading-relaxed text-muted-foreground">
            Take Siege seriously and the default experience fights you every match. Here&apos;s a
            breakdown of what public matchmaking actually costs you.
          </p>

          <GlassPanel className="mt-8 flex items-baseline gap-4 p-5">
            <CountUp target={3} className="font-mono text-4xl font-semibold text-foreground" />
            <span className="text-sm leading-snug text-muted-foreground">
              recurring failures Parley is built to eliminate — before the Discord app even
              launches.
            </span>
          </GlassPanel>
        </Reveal>

        <RevealStagger as="ul" itemAs="li" className="flex flex-col gap-4">
          {symptoms.map((item) => (
            <GlassPanel
              key={item.title}
              className="group p-6 transition-transform hover:scale-[1.01]"
            >
              <div className="flex gap-6">
                <span className="font-mono text-sm leading-none text-muted-foreground/60 transition-colors group-hover:text-accent-silver">
                  {item.index}
                </span>
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="parley-icon-pop flex size-10 shrink-0 items-center justify-center rounded-2xl bg-muted/50">
                      <item.icon className="size-4 text-accent-silver" aria-hidden="true" />
                    </div>
                    <h3 className="text-lg font-medium text-foreground">{item.title}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                </div>
              </div>
            </GlassPanel>
          ))}
        </RevealStagger>
      </div>
    </section>
  );
}