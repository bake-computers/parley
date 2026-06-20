import { ArrowDown } from "lucide-react";
import { Button } from "#/components/ui/button";
import { HeroLobbyDemo } from "#/components/HeroLobbyDemo";
import { SectionBackdrop } from "#/components/ui/section-backdrop";

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[calc(100svh-7rem)] items-center overflow-hidden"
    >
      <SectionBackdrop glow="left" />
      <SectionBackdrop glow="right" />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:gap-16 md:py-28">
        <div className="flex flex-col items-start text-left">
          <span className="glass-chip inline-flex animate-in fade-in slide-in-from-bottom-2 items-center gap-2 px-4 py-1.5 text-sm font-medium text-muted-foreground duration-700">
            <span className="size-1.5 rounded-full bg-accent-silver" />
            Pre-launch · Discord app first
          </span>

          <h1 className="mt-8 max-w-xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-5xl lg:text-6xl">
            Fair, <span className="text-accent-silver">skill-matched</span> Rainbow Six Siege.
          </h1>

          <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-lg">
            A Discord app that builds balanced teams from real{" "}
            <span className="text-accent-silver">skill and telemetry</span> — then automates scrims
            and tournaments.
          </p>

          <div className="mt-10 flex w-full flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 sm:flex-row sm:w-auto">
            <Button
              size="lg"
              className="w-full rounded-full bg-foreground text-background transition-all hover:scale-[1.02] hover:bg-foreground/90 active:scale-[0.98] sm:w-auto"
            >
              <a href="#discord">Join Discord</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full rounded-full border-border/70 bg-transparent text-foreground transition-all hover:scale-[1.02] hover:bg-secondary/50 active:scale-[0.98] sm:w-auto"
            >
              <a href="#experience">See how it works</a>
            </Button>
          </div>
        </div>

        <div className="animate-in fade-in slide-in-from-bottom-4 duration-1000 md:slide-in-from-right-4">
          <HeroLobbyDemo />
        </div>
      </div>

      <a
        href="#problem"
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 text-xs font-medium text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowDown className="size-3" aria-hidden="true" />
        Explore
      </a>
    </section>
  );
}