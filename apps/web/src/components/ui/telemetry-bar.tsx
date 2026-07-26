import type { RefObject } from "react";
import { useInView } from "#/hooks/useInView";
import { cn } from "#/lib/shared/cn";

type TelemetryBarProps = {
  label: string;
  value: number;
  pct: number;
  delay?: number;
};

export function TelemetryBar({ label, value, pct, delay = 0 }: TelemetryBarProps) {
  const { ref, inView } = useInView();

  return (
    <div ref={ref as RefObject<HTMLDivElement>}>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono text-foreground">{value}</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-border/60">
        <div
          className={cn(
            "h-full origin-left rounded-full bg-accent-silver motion-reduce:transition-none",
            inView ? "animate-[parley-bar_0.8s_ease-out_forwards]" : "scale-x-0",
          )}
          style={{
            width: `${pct}%`,
            animationDelay: inView ? `${delay}ms` : undefined,
          }}
        />
      </div>
    </div>
  );
}
