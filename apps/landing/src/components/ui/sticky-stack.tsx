import { cn } from "#/lib/utils";

type StickyStackSectionProps = {
  id: string;
  children: React.ReactNode;
  className?: string;
  zIndex?: number;
};

export function StickyStack({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("stack-scroll relative", className)}>{children}</div>;
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
      className="stack-section px-4 pb-6 md:px-6"
      style={{ zIndex }}
    >
      <div
        className={cn(
          "stack-card glass-panel mx-auto flex min-h-[calc(100dvh-7.5rem)] w-full max-w-6xl flex-col justify-center overflow-hidden px-6 py-10 md:px-10 md:py-14",
          className,
        )}
      >
        {children}
      </div>
    </section>
  );
}