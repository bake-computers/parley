"use client";

import { lazy, Suspense, useEffect, useState } from "react";
import { ArrowDown } from "lucide-react";
import { smoothScrollTo } from "#/lib/shared/smooth-scroll";
import { useMessages } from "#/lib/content/messages/use-messages";

const HeroShaderOverlay = lazy(() =>
  import("#/components/HeroShaderOverlay").then((m) => ({ default: m.HeroShaderOverlay })),
);

const ctaPrimary =
  "inline-flex h-12 min-h-12 w-full items-center justify-center rounded-full bg-foreground px-8 text-sm font-medium text-background transition-all hover:scale-[1.02] hover:bg-foreground/90 active:scale-[0.98] sm:w-auto";
const ctaOutline =
  "inline-flex h-12 min-h-12 w-full items-center justify-center rounded-full border border-border/70 bg-background/40 px-8 text-sm font-medium text-foreground backdrop-blur-sm transition-all hover:scale-[1.02] hover:bg-secondary/50 active:scale-[0.98] sm:w-auto";

function useDeferredShader() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    if (!("gpu" in navigator)) {
      return;
    }

    const start = () => setReady(true);
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(start, { timeout: 2000 });
      return () => window.cancelIdleCallback(id);
    }
    const timer = globalThis.setTimeout(start, 1500);
    return () => globalThis.clearTimeout(timer);
  }, []);

  return ready;
}

export function Hero() {
  const shaderReady = useDeferredShader();
  const m = useMessages();
  const h = m.home.hero;

  return (
    <section id="top" className="relative min-h-[100dvh] overflow-hidden">
      <div className="absolute inset-0 bg-muted/30" aria-hidden="true">
        <picture>
          <source
            media="(max-width: 767px)"
            srcSet="/assets/hero/hero-cinematic-768.webp"
            type="image/webp"
          />
          <source
            media="(min-width: 768px)"
            srcSet="/assets/hero/hero-cinematic-1280.webp"
            type="image/webp"
          />
          <img
            src="/assets/hero/hero-cinematic-768.webp"
            alt=""
            width={768}
            height={432}
            loading="eager"
            fetchPriority="high"
            decoding="async"
            className="hero-drift h-full w-full object-cover object-[62%_38%]"
          />
        </picture>
        <div className="absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-background/70 via-background/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-background/45 to-transparent" />
        <div className="hero-chrome absolute inset-0 opacity-70" />
        {shaderReady ? (
          <Suspense fallback={null}>
            <HeroShaderOverlay />
          </Suspense>
        ) : null}
        <div className="hero-fade-tail absolute inset-x-0 bottom-0" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-end px-6 pb-28 pt-24 md:justify-center md:pb-[20vh]">
        <div className="max-w-2xl">
          {/* <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/50 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-1000">
            <span className="size-1.5 rounded-full bg-accent-silver" aria-hidden="true" />
            {h.betaBadge}
          </p> */}
          <h1 className="max-w-xl text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-5xl lg:text-6xl">
            {h.titleBefore}
            <span className="text-accent-silver">{h.titleHighlight}</span>
            {h.titleAfter}
          </h1>

          <p className="mt-5 max-w-md text-pretty text-base leading-relaxed text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 md:text-lg">
            {h.subtitle}
          </p>

          <div className="mt-8 flex w-full flex-col gap-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 sm:flex-row sm:w-auto">
            <a href="#discord" className={ctaPrimary}>
              {h.ctaDiscord}
            </a>
            <a href="#experience" className={ctaOutline}>
              {h.ctaHow}
            </a>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => smoothScrollTo("#problem", 1800)}
        className="absolute bottom-8 left-1/2 z-10 flex min-h-12 -translate-x-1/2 items-center gap-2 rounded-full border border-border/50 bg-background/50 px-5 py-3 text-xs font-medium text-muted-foreground backdrop-blur-md transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <ArrowDown className="size-3.5" aria-hidden="true" />
        {h.explore}
      </button>
    </section>
  );
}
