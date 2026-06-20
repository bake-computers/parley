"use client";

import { useEffect, useRef } from "react";
import { cn } from "#/lib/utils";

type StickyStackSectionProps = {
  id: string;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
};

const STICKY_TOP = 88; // 5.5rem

function handoffProgress(sectionTop: number) {
  const range = window.innerHeight - STICKY_TOP;
  if (range <= 0) return 1;
  return Math.min(1, Math.max(0, (window.innerHeight - sectionTop) / range));
}

export function StickyStack({ children, className }: { children: React.ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;

    const sections = [...root.querySelectorAll<HTMLElement>(".stack-section")];
    let frame = 0;

    const tick = () => {
      for (let i = 0; i < sections.length; i++) {
        const card = sections[i].querySelector<HTMLElement>(".stack-card");
        if (!card) continue;

        const next = sections[i + 1];
        const outProg = next ? handoffProgress(next.getBoundingClientRect().top) : 0;
        const inProg = i > 0 ? handoffProgress(sections[i].getBoundingClientRect().top) : 1;

        if (outProg > 0) {
          const fade = 1 - outProg;
          card.style.opacity = String(fade);
          card.style.transform = `translateY(${-outProg * 32}px) scale(${0.9 + fade * 0.1})`;
          card.style.filter = outProg > 0.2 ? `blur(${outProg * 4}px)` : "none";
          card.style.pointerEvents = fade < 0.35 ? "none" : "";
        } else if (inProg < 1) {
          card.style.opacity = "1";
          card.style.transform = `translateY(${(1 - inProg) * 48}px)`;
          card.style.filter = "none";
          card.style.pointerEvents = "";
        } else {
          card.style.opacity = "";
          card.style.transform = "";
          card.style.filter = "";
          card.style.pointerEvents = "";
        }
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(tick);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    tick();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      for (const section of sections) {
        const card = section.querySelector<HTMLElement>(".stack-card");
        if (!card) continue;
        card.style.opacity = "";
        card.style.transform = "";
        card.style.filter = "";
        card.style.pointerEvents = "";
      }
    };
  }, []);

  return (
    <div ref={rootRef} className={cn("stack-scroll relative", className)}>
      {children}
    </div>
  );
}

export function StickyStackSection({
  id,
  children,
  className,
  zIndex = 1,
}: StickyStackSectionProps) {
  return (
    <section
      id={id}
      className="stack-section relative px-4 pb-6 md:px-6"
      style={{ zIndex }}
    >
      <div
        className={cn(
          "stack-card mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-6xl flex-col justify-center px-6 py-10 will-change-[transform,opacity,filter] md:px-10 md:py-14",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}