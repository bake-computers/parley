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

function clearCard(card: HTMLElement) {
  card.style.opacity = "";
  card.style.visibility = "";
  card.style.transform = "";
  card.style.filter = "";
  card.style.pointerEvents = "";
}

function hideCard(card: HTMLElement) {
  card.style.opacity = "0";
  card.style.visibility = "hidden";
  card.style.transform = "translateY(-36px) scale(0.88)";
  card.style.filter = "blur(6px)";
  card.style.pointerEvents = "none";
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

    const update = () => {
      let topmostStuck = -1;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= STICKY_TOP + 2) topmostStuck = i;
      }

      for (let i = 0; i < sections.length; i++) {
        const card = sections[i].querySelector<HTMLElement>(".stack-card");
        if (!card) continue;

        const next = sections[i + 1];
        const top = sections[i].getBoundingClientRect().top;

        if (i < topmostStuck) {
          hideCard(card);
          continue;
        }

        if (next) {
          const outProg = handoffProgress(next.getBoundingClientRect().top);
          if (outProg > 0) {
            const fade = Math.max(0, 1 - outProg * 1.6);
            card.style.opacity = String(fade);
            card.style.visibility = fade < 0.04 ? "hidden" : "visible";
            card.style.transform = `translateY(${-outProg * 40}px) scale(${0.88 + fade * 0.12})`;
            card.style.filter = outProg > 0.12 ? `blur(${outProg * 6}px)` : "none";
            card.style.pointerEvents = fade < 0.2 ? "none" : "";
            continue;
          }
        }

        if (i > 0 && top > STICKY_TOP + 4) {
          const inProg = handoffProgress(top);
          if (inProg < 1) {
            card.style.opacity = "1";
            card.style.visibility = "visible";
            card.style.transform = `translateY(${(1 - inProg) * 48}px)`;
            card.style.filter = "none";
            card.style.pointerEvents = "";
            continue;
          }
        }

        clearCard(card);
      }
    };

    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(frame);
      for (const section of sections) {
        const card = section.querySelector<HTMLElement>(".stack-card");
        if (card) clearCard(card);
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
      className="stack-section relative isolate px-4 pb-6 md:px-6"
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