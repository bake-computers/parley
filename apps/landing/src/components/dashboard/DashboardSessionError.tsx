import { GlassPanel } from "#/components/ui/glass-panel";
import { buttonVariants } from "#/components/ui/button";
import { cn } from "#/lib/shared/cn";

export function DashboardSessionError({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
      <GlassPanel className="w-full p-8">
        <p className="text-sm font-medium">Could not refresh your session</p>
        <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
          The dashboard is still signed in, but server list data did not load. Try again in a moment.
        </p>
        <button type="button" onClick={onRetry} className={cn(buttonVariants(), "mt-6")}>
          Retry
        </button>
      </GlassPanel>
    </main>
  );
}