import { Card, CardContent } from "#/components/ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Sword01Icon,
  UserGroupIcon,
  Award01Icon,
  FlashIcon,
  ComputerIcon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";

const features = [
  {
    icon: Sword01Icon,
    title: "Internal ELO",
    description:
      "Track skill independently of Ubisoft ranks. Your ELO reflects actual match outcomes, not just ranked points.",
  },
  {
    icon: UserGroupIcon,
    title: "Cross-Server Matchmaking",
    description:
      "Queue your 5-stack against teams from other servers. No more waiting for in-house opponents.",
  },
  {
    icon: Award01Icon,
    title: "Tournament System",
    description:
      "Create and join public tournaments — single or double elimination, up to 32 teams, with auto-bracket generation.",
  },
  {
    icon: FlashIcon,
    title: "Smart Seeding",
    description:
      "New players get ELO estimated from ranked stats. No placement grind — jump in and compete.",
  },
  {
    icon: ComputerIcon,
    title: "Multi-Platform",
    description:
      "PC, Xbox, and PlayStation. Auto-detect platform or choose manually. One account across all servers.",
  },
  {
    icon: SecurityCheckIcon,
    title: "Verified Results",
    description: "Both captains submit match results. No one-sided reporting — integrity built in.",
  },
];

export function Features() {
  return (
    <section className="lp-section">
      <div className="mb-12">
        <p className="lp-label mb-2">Features</p>
        <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
          Built for Competitive Siege
        </h2>
      </div>
      <div className="lp-grid lp-grid-3">
        {features.map((feature) => (
          <Card key={feature.title} className="lp-card">
            <CardContent className="p-6">
              <HugeiconsIcon icon={feature.icon} strokeWidth={2} className="size-8 text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
