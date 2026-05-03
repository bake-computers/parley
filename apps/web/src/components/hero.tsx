import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";
import { FloatingStatCard } from "#/components/ui/floating-stat-card";

export function Hero() {
  return (
    <section className="lp-hero hero-bg hero-noise">
      <div className="lp-container hero-content">
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

          <h1 className="hero-title gradient-text hero-animate hero-delay-2">PARLEY</h1>

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
              <a href="/leaderboard">View Leaderboard</a>
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
