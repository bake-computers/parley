import { cn } from "#/lib/shared/cn";

type SectionBackdropProps = {
  glow?: "left" | "right" | "center";
};

export function SectionBackdrop({ glow = "center" }: SectionBackdropProps) {
  const glowPosition =
    glow === "left"
      ? "-left-32 top-0 -translate-y-1/4"
      : glow === "right"
        ? "-right-32 top-1/3 translate-x-1/4"
        : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";

  const glowOpacity = glow === "center" ? "rgba(192,197,206,0.1)" : "rgba(192,197,206,0.14)";

  return (
    <div
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute h-[28rem] w-[28rem] rounded-full blur-3xl",
        glowPosition,
      )}
      style={{
        background: `radial-gradient(circle, ${glowOpacity}, transparent 65%)`,
      }}
    />
  );
}
