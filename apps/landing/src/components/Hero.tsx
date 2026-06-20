"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { Image } from "@unpic/react";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { smoothScrollTo } from "#/lib/smooth-scroll";
import { cn } from "#/lib/utils";

export function Hero() {
  const imgRef = useRef<HTMLImageElement>(null);
  const [heroLoaded, setHeroLoaded] = useState(false);

  useEffect(() => {
    if (imgRef.current?.complete) {
      setHeroLoaded(true);
    }
  }, []);

  return (
    <section id="top" className="relative min-h-[100dvh] overflow-hidden">
      <div className="absolute inset-0" aria-hidden="true">
        {!heroLoaded ? (
          <Skeleton className="absolute inset-0 rounded-none bg-muted/30" />
        ) : null}
        <Image
          ref={imgRef}
          src="/assets/hero-cinematic.webp"
          alt=""
          width={1920}
          height={1080}
          loading="eager"
          fetchPriority="high"
          onLoad={() => setHeroLoaded(true)}
          className={cn(
            "hero-drift h-full w-full object-cover object-[62%_38%] transition-opacity duration-700 ease-out motion-reduce:transition-none",
            heroLoaded ? "opacity-100" : "opacity-0",
          )}
        />
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-background/70 via-background/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/45 to-transparent" />
        <div className="hero-chrome absolute inset-0 opacity-70" />
        <div className="hero-fade-tail absolute inset-x-0 bottom-0" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-end px-6 pb-28 pt-24">
        <div className="max-w-2xl">
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-5xl lg:text-6xl">
            Fair,{" "}
            <span className="text-accent-silver">skill-matched</span>{" "}
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