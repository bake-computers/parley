import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { FloatingStatCard } from "./ui/floating-stat-card";
import { ArrowRight } from "lucide-react";

export function Hero() {
  return (
    <section className="lp-hero hero-bg hero-noise relative overflow-hidden pt-14 md:pt-16">
      <div className="hero-orb hero-orb-1" />
      <div className="hero-orb hero-orb-2" />
      <div className="hero-orb hero-orb-3" />
      <div className="hero-grid-lines" />

      <div className="lp-container hero-content relative z-10">
        <div className="hero-main">
          <div className="flex flex-wrap gap-2 mb-6 hero-animate hero-delay-1">
            <Badge variant="gradient-mixed" className="text-xs">
              Cross-Server ELO
            </Badge>
            <Badge variant="gradient-blue" className="text-xs">
              5v5 Matchmaking
            </Badge>
            <Badge variant="gradient-cyan" className="text-xs">
              Tournaments
            </Badge>
          </div>

          <h1 className="hero-title hero-title-glow gradient-text whitespace-nowrap hero-animate hero-delay-2">
            PARLEY
          </h1>

          <p className="text-xl md:text-2xl mt-4 font-normal text-foreground hero-animate hero-delay-3">
            Competitive Siege, Made Simple
          </p>

          <p className="lp-subtitle mt-3 max-w-xl hero-animate hero-delay-3">
            The Discord bot for Rainbow Six Siege competitive play. Track ELO across servers, build
            balanced teams, queue 5v5 matchmaking, and run tournaments — all in one place.
          </p>

          <div className="flex flex-wrap gap-4 mt-8 hero-animate hero-delay-4">
            <Button asChild size="lg" variant="gradient" className="hero-cta-gradient">
              <a
                href="https://discord.com/oauth2/authorize?client_id=PLACEHOLDER"
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Discord
              </a>
            </Button>
            <Button asChild variant="depth" size="lg">
              <a href="/leaderboard" className="gap-2">
                View Leaderboard
                <ArrowRight className="size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="hero-stats">
          <div className="hero-animate hero-delay-5">
            <FloatingStatCard value="12,847" label="Players Tracked" accent="blue" />
          </div>
          <div className="hero-animate hero-delay-6">
            <FloatingStatCard value="94,203" label="Matches Played" accent="cyan" />
          </div>
          <div className="hero-animate hero-delay-7">
            <FloatingStatCard value="156" label="Active Tournaments" accent="mixed" />
          </div>
        </div>
      </div>
    </section>
  );
}
