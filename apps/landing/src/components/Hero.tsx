import { Image } from "@unpic/react";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[calc(100svh-4rem)] items-center justify-center overflow-hidden border-b border-border/60"
    >
      {/* subtle grid backdrop */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />
      {/* radial silver glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-0 h-130 w-130 -translate-x-1/2 -translate-y-1/4 rounded-full bg-[radial-gradient(circle,rgba(192,197,206,0.18),transparent_70%)]"
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 py-20 text-center">
        <span className="mb-8 inline-flex animate-in fade-in slide-in-from-bottom-2 items-center gap-2 border border-border/70 bg-secondary/40 px-4 py-1.5 text-[11px] uppercase tracking-[0.25em] text-muted-foreground duration-700">
          <span className="size-1.5 rounded-full bg-[#c0c5ce]" />
          Pre-launch · Discord app first
        </span>

        <Image
          src="/parley-logo.svg"
          alt="Parley logo"
          width={120}
          height={120}
          className="mb-10 size-24 animate-in fade-in zoom-in-95 duration-1000 md:size-28"
        />

        <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-tight tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-6xl">
          Fair, <span className="text-[#c0c5ce]">skill-matched</span> Rainbow Six Siege.
        </h1>

        <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-lg">
          A <span className="text-foreground">Discord app</span> that builds balanced teams from
          real <span className="text-[#c0c5ce]">skill and telemetry</span> — then automates scrims
          and tournaments. <span className="text-foreground">Coming soon.</span>
        </p>

        <div className="mt-10 flex w-full flex-col items-center justify-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 sm:flex-row">
          <Button
            size="lg"
            className="w-full bg-foreground text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground/90 sm:w-auto"
          >
            <a href="#waitlist">Get notified at launch</a>
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

      {/* scroll cue */}
      <div
        aria-hidden="true"
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60"
      >
        Scroll
      </div>
    </section>
  );
}
