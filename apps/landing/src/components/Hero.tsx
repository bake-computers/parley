"use client";

import { ArrowDown } from "lucide-react";
import { Image } from "@unpic/react";
import { Button } from "#/components/ui/button";
import { smoothScrollTo } from "#/lib/smooth-scroll";

export function Hero() {
  return (
    <section
      id="top"
      className="relative min-h-[calc(100dvh-5rem)] overflow-hidden"
    >
      <div className="absolute inset-0" aria-hidden="true">
        <Image
          src="/assets/hero-cinematic.webp"
          alt=""
          width={1920}
          height={1080}
          priority
          className="hero-drift h-full w-full object-cover object-[62%_38%]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/75 to-background/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/95 via-background/55 to-transparent" />
        <div className="hero-chrome absolute inset-0 opacity-70" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-6xl flex-col justify-end px-6 pb-28 pt-20">
        <div className="max-w-2xl">
          <span className="glass-chip inline-flex animate-in fade-in slide-in-from-bottom-2 px-4 py-1.5 text-sm font-medium text-muted-foreground duration-700">
            Pre-launch, Discord app first
          </span>

          <h1 className="mt-6 max-w-xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-5xl lg:text-6xl">
            Fair,{" "}
            <span className="hero-text-fill bg-clip-text text-transparent">skill-matched</span>{" "}
            Rainbow Six Siege.
          </h1>

          <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-lg">
            A Discord app that builds balanced teams from real skill and telemetry, then automates
            scrims and tournaments.
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 sm:flex-row sm:w-auto">
            <Button
              size="lg"
              className="w-full rounded-full bg-foreground text-background transition-all hover:scale-[1.02] hover:bg-foreground/90 active:scale-[0.98] sm:w-auto"
            >
              <a href="#discord">Join Discord</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="w-full rounded-full border-border/70 bg-background/40 text-foreground backdrop-blur-sm transition-all hover:scale-[1.02] hover:bg-secondary/50 active:scale-[0.98] sm:w-auto"
            >
              <a href="#experience">See how it works</a>
            </Button>
          </div>
        </div>

        <div
          className="pointer-events-none absolute -right-4 top-[38%] hidden h-56 w-56 rounded-full border border-accent-silver/20 bg-accent-silver/5 blur-3xl md:block lg:-right-8 lg:h-72 lg:w-72"
          aria-hidden="true"
        />
      </div>

      <button
        type="button"
        onClick={() => smoothScrollTo("#problem", 1800)}
        className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border/50 bg-background/50 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-md transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowDown className="size-3.5" aria-hidden="true" />
        Explore
      </button>
    </section>
  );
}