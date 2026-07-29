"use client";

import { useRef } from "react";
import { cn } from "#/lib/shared/cn";

type SpotlightCardProps = {
  title: string;
  body: string;
  className?: string;
};

export function SpotlightCard({ title, body, className }: SpotlightCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const setPos = (e: React.PointerEvent<HTMLDivElement>) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    node.style.setProperty("--my", `${e.clientY - rect.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={setPos}
      onPointerEnter={setPos}
      className={cn(
        "problem-card group relative h-full overflow-hidden rounded-2xl border border-border/60 bg-muted/25 p-6 transition-colors duration-300 hover:border-accent-silver/35 focus-within:border-accent-silver/35 md:p-7",
        className,
      )}
    >
      <div className="problem-spotlight pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-within:opacity-100" />
      <span
        className="problem-rail pointer-events-none absolute inset-y-5 left-0 w-px origin-top scale-y-0 bg-accent-silver/70 transition-transform duration-300 ease-out group-hover:scale-y-100 group-focus-within:scale-y-100"
        aria-hidden="true"
      />
      <div className="relative pl-4">
        <h3 className="text-xl font-medium tracking-tight text-foreground">{title}</h3>
        <p className="mt-2 text-pretty leading-relaxed text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}
