import { cn } from "../../lib/utils";

interface FloatingStatCardProps {
  value: string;
  label: string;
  accent?: "blue" | "cyan" | "mixed";
  className?: string;
}

const accentDotClass = {
  blue: "bg-accent-blue",
  cyan: "bg-accent-cyan",
  mixed: "hero-dot-mixed",
};

export function FloatingStatCard({
  value,
  label,
  accent = "blue",
  className,
}: FloatingStatCardProps) {
  return (
    <div className={cn("hero-stat-card depth-panel rounded-lg p-5", className)}>
      <div className="flex items-center gap-2 mb-2">
        <div className={cn("w-2 h-2 rounded-full shrink-0", accentDotClass[accent])} />
        <span className="lp-label">{label}</span>
      </div>
      <span className="text-2xl md:text-3xl font-bold tracking-tight">{value}</span>
    </div>
  );
}
