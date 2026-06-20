import { cn } from "#/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton-block rounded-xl bg-muted/40", className)} aria-hidden="true" />;
}

export function SectionSkeleton() {
  return (
    <div className="w-full space-y-10" role="status" aria-label="Loading section">
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-xl rounded-2xl" />
        <Skeleton className="h-5 w-full max-w-sm" />
      </div>
      <div className="grid gap-4 md:grid-cols-12 md:grid-rows-[auto_auto]">
        <Skeleton className="h-56 rounded-2xl md:col-span-5 md:row-span-2 md:h-auto" />
        <Skeleton className="h-28 rounded-2xl md:col-span-7" />
        <Skeleton className="h-28 rounded-2xl md:col-span-4" />
        <Skeleton className="h-28 rounded-2xl md:col-span-3" />
      </div>
    </div>
  );
}