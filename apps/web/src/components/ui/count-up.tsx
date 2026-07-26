import { useEffect, useState, type RefObject } from "react";
import { useInView } from "#/hooks/useInView";
import { cn } from "#/lib/shared/cn";

type CountUpProps = {
  target: number;
  duration?: number;
  className?: string;
};

export function CountUp({ target, duration = 600, className }: CountUpProps) {
  const { ref, inView } = useInView();
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!inView) {
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      setValue(Math.round(progress * target));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    };

    requestAnimationFrame(tick);
  }, [inView, target, duration]);

  return (
    <span ref={ref as RefObject<HTMLSpanElement>} className={cn("tabular-nums", className)}>
      {value}
    </span>
  );
}
