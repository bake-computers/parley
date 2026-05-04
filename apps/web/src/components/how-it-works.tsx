import { HugeiconsIcon } from "@hugeicons/react";
import { BotIcon, Link01Icon, ChartIncreaseIcon } from "@hugeicons/core-free-icons";

const steps = [
  {
    number: "01",
    icon: BotIcon,
    title: "Add to Server",
    description:
      "Invite Parley to your Discord server with one click. No complex setup — just authorize and you're ready.",
  },
  {
    number: "02",
    icon: Link01Icon,
    title: "Link & Play",
    description:
      "Players link their Ubisoft accounts. Parley pulls ranked stats to seed initial ELO, then tracks every match.",
  },
  {
    number: "03",
    icon: ChartIncreaseIcon,
    title: "Climb the Ranks",
    description:
      "Win matches, gain ELO, climb the leaderboard. Cross-server matchmaking means you always find competitive games.",
  },
];

export function HowItWorks() {
  return (
    <section className="lp-section">
      <div className="mb-12">
        <p className="lp-label mb-2">How it works</p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Three steps to <span className="gradient-text">competitive play</span>
        </h2>
      </div>

      <div className="how-it-works__steps">
        {steps.map((step, i) => (
          <div key={step.number} className="how-it-works__step">
            {i < steps.length - 1 && <div className="how-it-works__connector" aria-hidden="true" />}
            <div className="how-it-works__card depth-panel">
              <div className="how-it-works__badge">
                <span className="how-it-works__number">{step.number}</span>
              </div>
              <HugeiconsIcon icon={step.icon} strokeWidth={2} className="size-7 text-primary mb-3" />
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
