import { cn } from "#/lib/shared/cn";

type DashboardLoaderProps = {
  label?: string;
  fullScreen?: boolean;
};

export function DashboardLoader({ label = "Loading…", fullScreen = false }: DashboardLoaderProps) {
  return (
    <main
      className={cn(
        "flex items-center justify-center px-6 py-16",
        fullScreen ? "min-h-screen" : "min-h-[50vh]",
      )}
    >
      <div role="status" aria-live="polite" className="flex flex-col items-center gap-4">
        <div
          className="size-9 animate-spin rounded-full border-2 border-muted/60 border-t-primary"
          aria-hidden
        />
        <p className="text-muted-foreground text-sm">{label}</p>
      </div>
    </main>
  );
}
