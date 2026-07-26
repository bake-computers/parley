import { GlassPanel } from "#/components/ui/glass-panel";
import { Skeleton } from "#/components/ui/skeleton";

export function GuildSettingsSkeleton() {
  return (
    <div className="dashboard-fade-in space-y-6" role="status" aria-label="Loading settings">
      <GlassPanel className="flex flex-col gap-5 p-6">
        <div className="space-y-2">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-full max-w-md" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-[66%]" />
        </div>
      </GlassPanel>
      <GlassPanel className="flex flex-col gap-4 p-6">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-24 w-full" />
      </GlassPanel>
    </div>
  );
}
