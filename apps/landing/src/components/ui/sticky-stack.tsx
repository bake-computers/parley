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
const MOBILE_MAX = 767;

function handoffProgress(sectionTop: number) {
  const range = window.innerHeight - STICKY_TOP;
  if (range <= 0) return 1;
  return Math.min(1, Math.max(0, (window.innerHeight - sectionTop) / range));
}

function clearLayer(el: HTMLElement) {
  el.style.opacity = "";
  el.style.visibility = "";
  el.style.transform = "";
  el.style.filter = "";
  el.style.pointerEvents = "";
}

function hideLayer(el: HTMLElement) {
  el.style.opacity = "0";
  el.style.visibility = "hidden";
  el.style.transform = "translateY(-36px) scale(0.88)";
  el.style.filter = "blur(6px)";
  el.style.pointerEvents = "none";
}

function setHandoff(el: HTMLElement, outProg: number) {
  const fade = Math.max(0, 1 - outProg * 1.6);
  el.style.opacity = String(fade);
  el.style.visibility = fade < 0.04 ? "hidden" : "visible";
  el.style.transform = `translateY(${-outProg * 40}px) scale(${0.88 + fade * 0.12})`;
  el.style.filter = outProg > 0.12 ? `blur(${outProg * 6}px)` : "none";
  el.style.pointerEvents = fade < 0.2 ? "none" : "";
}

export function StickyStack({ children, className }: { children: React.ReactNode; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const mobile = window.matchMedia(`(max-width: ${MOBILE_MAX}px)`).matches;
    if (reduce || mobile) return;

    const sections = [...root.querySelectorAll<HTMLElement>(".stack-section")];
    let frame = 0;

    const layers = (section: HTMLElement) => {
      const card = section.querySelector<HTMLElement>(".stack-card");
      const surface = section.querySelector<HTMLElement>(".stack-surface");
      return { card, surface };
    };

    const update = () => {
      let topmostStuck = -1;
      for (let i = 0; i < sections.length; i++) {
        if (sections[i].getBoundingClientRect().top <= STICKY_TOP + 2) topmostStuck = i;
      }

      for (let i = 0; i < sections.length; i++) {
        const { card, surface } = layers(sections[i]);
        if (!card) continue;

        const next = sections[i + 1];
        const top = sections[i].getBoundingClientRect().top;

        if (i < topmostStuck) {
          hideLayer(card);
          if (surface) hideLayer(surface);
          continue;
        }

        if (next) {
          const outProg = handoffProgress(next.getBoundingClientRect().top);
          if (outProg > 0) {
            setHandoff(card, outProg);
            if (surface) setHandoff(surface, outProg);
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
            if (surface) {
              surface.style.opacity = "1";
              surface.style.visibility = "visible";
              surface.style.transform = "";
              surface.style.filter = "none";
            }
            continue;
          }
        }

        clearLayer(card);
        if (surface) clearLayer(surface);
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
        const { card, surface } = layers(section);
        if (card) clearLayer(card);
        if (surface) clearLayer(surface);
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
      className="stack-section relative isolate px-4 pb-8 md:px-6 md:pb-6"
      style={{ zIndex }}
    >
      <div className="stack-surface pointer-events-none absolute inset-0" aria-hidden="true" />
      <div
        className={cn(
          "stack-card relative z-10 mx-auto flex w-full max-w-6xl flex-col justify-center px-4 py-10 will-change-[transform,opacity,filter] md:min-h-[calc(100dvh-7.5rem)] md:px-10 md:py-14",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}