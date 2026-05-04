import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Card, CardContent } from "./ui/card";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

export function Hero() {
  return (
    <section className="lp-hero hero-bg relative overflow-hidden pt-14 md:pt-16">
      <div className="lp-container hero-content relative z-10">
        <div className="hero-main">
          <div className="flex flex-wrap gap-2 mb-6 hero-animate hero-delay-1">
            <Badge variant="default" className="text-xs">
              Cross-Server ELO
            </Badge>
            <Badge variant="default" className="text-xs">
              5v5 Matchmaking
            </Badge>
            <Badge variant="default" className="text-xs">
              Tournaments
            </Badge>
          </div>

          <h1 className="hero-title gradient-text whitespace-nowrap hero-animate hero-delay-2">
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
            <Button asChild size="lg" variant="default">
              <a
                href="https://discord.com/oauth2/authorize?client_id=PLACEHOLDER"
                target="_blank"
                rel="noopener noreferrer"
              >
                Add to Discord
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="/leaderboard" className="gap-2">
                View Leaderboard
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} className="size-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="hero-stats">
          <div className="hero-animate hero-delay-5">
            <Card className="hero-stat-card depth-panel">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-foreground" />
                  <span className="lp-label">Players Tracked</span>
                </div>
                <span className="text-2xl md:text-3xl font-bold tracking-tight">12,847</span>
              </CardContent>
            </Card>
          </div>
          <div className="hero-animate hero-delay-6">
            <Card className="hero-stat-card depth-panel">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-muted-foreground" />
                  <span className="lp-label">Matches Played</span>
                </div>
                <span className="text-2xl md:text-3xl font-bold tracking-tight">94,203</span>
              </CardContent>
            </Card>
          </div>
          <div className="hero-animate hero-delay-7">
            <Card className="hero-stat-card depth-panel">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full shrink-0 bg-primary" />
                  <span className="lp-label">Active Tournaments</span>
                </div>
                <span className="text-2xl md:text-3xl font-bold tracking-tight">156</span>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
