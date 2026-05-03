import { cn } from "#/lib/utils";
import { Sidebar } from "#/components/sidebar";
import { useGuildAccess } from "#/hooks/use-guild-access";

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { adminGuilds, isGlobalAdmin, isLoading } = useGuildAccess();
  const hasAccess = adminGuilds.length > 0 || isGlobalAdmin;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-accent-cyan" />
      </div>
    );
  }

  if (!hasAccess) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 min-w-0 pt-14 lg:pt-0">
        <div className={cn("lg:pl-0", "pl-0")}>{children}</div>
      </main>
    </div>
  );
}
