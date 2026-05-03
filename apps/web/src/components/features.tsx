import { Card, CardContent } from "#/components/ui/card";
import { Swords, Users, Trophy, Zap, Monitor, ShieldCheck } from "lucide-react";

const features = [
  {
    icon: Swords,
    title: "Internal ELO",
    description:
      "Track skill independently of Ubisoft ranks. Your ELO reflects actual match outcomes, not just ranked points.",
  },
  {
    icon: Users,
    title: "Cross-Server Matchmaking",
    description:
      "Queue your 5-stack against teams from other servers. No more waiting for in-house opponents.",
  },
  {
    icon: Trophy,
    title: "Tournament System",
    description:
      "Create and join public tournaments — single or double elimination, up to 32 teams, with auto-bracket generation.",
  },
  {
    icon: Zap,
    title: "Smart Seeding",
    description:
      "New players get ELO estimated from ranked stats. No placement grind — jump in and compete.",
  },
  {
    icon: Monitor,
    title: "Multi-Platform",
    description:
      "PC, Xbox, and PlayStation. Auto-detect platform or choose manually. One account across all servers.",
  },
  {
    icon: ShieldCheck,
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
              <feature.icon className="size-8 text-primary mb-4" />
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
