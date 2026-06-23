"use client";

import { useEffect, useRef } from "react";
import { startHeroShader } from "#/lib/shared/hero-shader";

export function HeroShaderOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    let handle: Awaited<ReturnType<typeof startHeroShader>> = null;
    let cancelled = false;

    startHeroShader(canvas).then((result) => {
      if (cancelled) {
        result?.stop();
        return;
      }
      handle = result;
    });

    return () => {
      cancelled = true;
      handle?.stop();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full opacity-70 mix-blend-soft-light"
    />
  );
}