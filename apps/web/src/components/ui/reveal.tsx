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

    // Already in view (e.g. above the fold on load): no animation needed.
    const rect = node.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) {
      return;
    }

    setVisible(false);
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" },
    );
    observer.observe(node);

    return () => {
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
