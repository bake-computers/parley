import { cn } from "#/lib/utils";

type SectionBackdropProps = {
  glow?: "left" | "right" | "center";
  grid?: boolean;
};

export function SectionBackdrop({ glow = "center", grid = false }: SectionBackdropProps) {
  const glowPosition =
    glow === "left"
      ? "-left-20 top-0 -translate-y-1/4"
      : glow === "right"
        ? "right-0 top-1/3 translate-x-1/4"
        : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";

  const glowOpacity = glow === "center" ? "rgba(192,197,206,0.06)" : "rgba(192,197,206,0.1)";

  return (
    <>
      {grid && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      )}
      <div
        aria-hidden="true"
        className={cn("pointer-events-none absolute h-96 w-96 rounded-full", glowPosition)}
        style={{
          background: `radial-gradient(circle, ${glowOpacity}, transparent 70%)`,
        }}
      />
    </>
  );
}
