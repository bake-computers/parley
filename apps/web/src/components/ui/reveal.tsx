"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "#/lib/shared/cn";

type RevealProps = {
  children: React.ReactNode;
  className?: string;
  /** Delay in ms before the reveal transition starts. */
  delay?: number;
  /** Direction the element slides in from. */
  direction?: "up" | "left" | "right";
  as?: "div" | "section" | "li" | "article";
};

type RevealStaggerProps = {
  children: React.ReactNode[];
  className?: string;
  direction?: "up" | "left" | "right";
  as?: "div" | "section" | "li" | "ul";
  /** Base delay between each child in ms. */
  interval?: number;
  itemAs?: "div" | "section" | "li" | "article";
};

export function Reveal({
  children,
  className,
  delay = 0,
  direction = "up",
  as = "div",
}: RevealProps) {
  const ref = useRef<HTMLElement | null>(null);
  // SSR and first paint show content; only below-fold elements hide and
  // animate in on scroll.
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    // Respect users who prefer reduced motion — keep content visible.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        }
      },
      // threshold 0: any pixel counts; mild bottom inset only
      { threshold: 0, rootMargin: "0px 0px -8% 0px" },
    );

    // Wait for layout before deciding to hide (double rAF). Never hide based on pre-paint rects.
    const raf1 = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const rect = node.getBoundingClientRect();
        const inView = rect.top < window.innerHeight * 0.92 && rect.bottom > 0;
        if (inView) {
          // stay visible — no hide flash for above-fold
          return;
        }
        setVisible(false);
        observer.observe(node);

        // Safety net: if still not revealed shortly after, force visible so content can never stick hidden
        timeoutId = window.setTimeout(() => {
          if (cancelled) return;
          const r = node.getBoundingClientRect();
          if (r.top < window.innerHeight && r.bottom > 0) {
            setVisible(true);
            observer.disconnect();
          }
        }, 400);
      });
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      observer.disconnect();
    };
  }, []);

  const hidden =
    direction === "up"
      ? "translate-y-6"
      : direction === "left"
        ? "-translate-x-6"
        : "translate-x-6";

  const Tag = as as React.ElementType;

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={cn(
        "transition-all duration-700 ease-out motion-reduce:transition-none",
        visible ? "translate-x-0 translate-y-0 opacity-100" : `opacity-0 ${hidden}`,
        className,
      )}
    >
      {children}
    </Tag>
  );
}

export function RevealStagger({
  children,
  className,
  direction = "up",
  as = "div",
  interval = 120,
  itemAs = "div",
}: RevealStaggerProps) {
  const Tag = as as React.ElementType;

  return (
    <Tag className={className}>
      {children.map((child, index) => (
        <Reveal key={index} as={itemAs} direction={direction} delay={index * interval}>
          {child}
        </Reveal>
      ))}
    </Tag>
  );
}
