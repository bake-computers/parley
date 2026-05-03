import { Button } from "#/components/ui/button";
import { Badge } from "#/components/ui/badge";

export function Hero() {
  return (
    <section className="lp-hero">
      <div className="lp-container">
        <div className="flex flex-wrap gap-2 mb-6">
          <Badge variant="secondary" className="text-xs">
            Cross-Server
          </Badge>
          <Badge variant="secondary" className="text-xs">
            ELO Tracking
          </Badge>
          <Badge variant="secondary" className="text-xs">
            Tournaments
          </Badge>
        </div>

        <h1 className="lp-title">PARLEY</h1>

        <p className="lp-subtitle text-xl md:text-2xl mt-4 font-medium">
          Competitive Siege, Made Simple
        </p>

        <p className="lp-subtitle mt-4 max-w-xl">
          The Discord bot for Rainbow Six Siege competitive play. Track ELO across servers, build
          balanced teams, queue 5v5 matchmaking, and run tournaments — all in one place.
        </p>

        <div className="flex flex-wrap gap-4 mt-8">
          <Button asChild size="lg" className="gap-2">
            <a
              href="https://discord.com/oauth2/authorize?client_id=1495122091165618358"
              target="_blank"
              rel="noopener noreferrer"
            >
              Add to Discord
            </a>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href="#commands">View Commands</a>
          </Button>
        </div>
      </div>
    </section>
  );
}
