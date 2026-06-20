import { ShieldOff, ScaleIcon, UserX } from "lucide-react";
import { CountUp } from "#/components/ui/count-up";
import { Reveal } from "#/components/ui/reveal";
import { cn } from "#/lib/utils";

const symptoms = [
  {
    icon: ShieldOff,
    title: "Lopsided lobbies",
    body: "Public queues throw mismatched skill levels together. Stomps replace the close rounds you want.",
    tint: "from-accent-silver/20 to-transparent",
  },
  {
    icon: UserX,
    title: "Unreliable teammates",
    body: "Leavers and throwers wreck games before they start. No accountability, no structure.",
    tint: "from-muted/80 to-transparent",
  },
  {
    icon: ScaleIcon,
    title: "No real balance",
    body: "Standard matchmaking ignores how you actually play. Without telemetry, fair is a guess.",
    tint: "from-accent-silver/10 to-muted/40",
  },
];

export function Problem() {
  return (
    <div className="w-full">
      <Reveal>
        <h2 className="max-w-2xl text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          The ranked grind is <span className="text-accent-silver">broken by design.</span>
        </h2>
        <p className="mt-4 max-w-lg text-pretty text-muted-foreground">
          Take Siege seriously and public matchmaking fights you every round.
        </p>
      </Reveal>

      <div className="mt-10 grid gap-4 md:grid-cols-12 md:grid-rows-[auto_auto]">
        <Reveal
          delay={80}
          className="flex flex-col justify-between rounded-2xl bg-gradient-to-br from-accent-silver/15 to-muted/30 p-6 md:col-span-5 md:row-span-2 md:p-8"
        >
          <div>
            <p className="text-sm font-medium text-muted-foreground">What it costs you</p>
            <CountUp
              target={3}
              className="mt-4 font-mono text-5xl font-semibold tracking-tight text-foreground md:text-6xl"
            />
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              recurring failures Parley is built to remove before the Discord app launches.
            </p>
          </div>
          <p className="mt-8 font-mono text-xs text-muted-foreground/70">
            Queue report / public matchmaking
          </p>
        </Reveal>

        {symptoms.map((item, index) => (
          <Reveal
            key={item.title}
            delay={120 + index * 80}
            className={cn(
              "group relative overflow-hidden rounded-2xl bg-gradient-to-br p-5",
              item.tint,
              index === 0 && "md:col-span-7",
              index === 1 && "md:col-span-4",
              index === 2 && "md:col-span-3",
            )}
          >
            <div className="relative flex gap-4">
              <div className="parley-icon-pop flex size-11 shrink-0 items-center justify-center rounded-2xl bg-background/50">
                <item.icon className="size-5 text-accent-silver" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-lg font-medium text-foreground">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            </div>
          </Reveal>
        ))}
      </div>
    </div>
  );
}