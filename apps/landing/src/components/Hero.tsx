import { ArrowDown } from "lucide-react";
import { Button } from "#/components/ui/button";
import { HeroLobbyDemo } from "#/components/HeroLobbyDemo";

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[calc(100svh-7rem)] items-center overflow-hidden border-b border-border/60"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 top-0 h-130 w-130 -translate-y-1/4 rounded-full bg-[radial-gradient(circle,rgba(192,197,206,0.14),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-1/3 h-96 w-96 translate-x-1/4 rounded-full bg-[radial-gradient(circle,rgba(192,197,206,0.08),transparent_70%)]"
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center md:gap-16 md:py-28">
        <div className="flex flex-col items-start text-left">
          <span className="inline-flex animate-in fade-in slide-in-from-bottom-2 items-center gap-2 border border-border/70 bg-secondary/40 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-muted-foreground duration-700">
            <span className="size-1.5 rounded-full bg-[#c0c5ce]" />
            Pre-launch · Discord app first
          </span>

          <h1 className="mt-8 max-w-xl text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-5xl lg:text-6xl">
            Fair, <span className="text-[#c0c5ce]">skill-matched</span> Rainbow Six Siege.
          </h1>

          <p className="mt-6 max-w-md text-pretty text-base leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-lg">
            A Discord app that builds balanced teams from real{" "}
            <span className="text-[#c0c5ce]">skill and telemetry</span> — then automates scrims and
            tournaments.
          </p>

          <div className="mt-10 flex w-full flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 sm:flex-row sm:w-auto">
            <Button
              size="lg"
              className="w-full bg-foreground text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground/90 sm:w-auto"
            >
              <a href="#discord">Join Discord</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full border-border/70 bg-transparent text-foreground transition-transform hover:-translate-y-0.5 hover:bg-secondary/50 sm:w-auto"
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
        className="absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60 transition-colors hover:text-muted-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowDown className="size-3" aria-hidden="true" />
        Explore
      </a>
    </section>
  );
}
