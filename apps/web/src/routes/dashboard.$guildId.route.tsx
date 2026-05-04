import { createFileRoute, Link, Outlet, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "#/lib/auth";
import { apiUrl } from "#/lib/api";
import { Button } from "#/components/ui/button";
import { Loader2, LayoutDashboard, History, ChevronLeft } from "lucide-react";

interface GuildDetail {
  guild: {
    id: string;
    name: string | null;
    icon: string | null;
  };
  settings: {
    defaultTeamFormat: string | null;
    autoBalance: boolean;
    crossGuildMatchmaking: boolean;
    updatedAt: number;
    updatedByDiscordUserId: string;
  } | null;
  limits: {
    dailyMatchLimit: number;
    updatedAt: number;
    updatedByDiscordUserId: string;
  } | null;
}

export const Route = createFileRoute("/dashboard/$guildId")({
  component: GuildLayout,
});

function GuildLayout() {
  const { guildId } = useParams({ from: "/dashboard/$guildId" });
  const { data: session } = authClient.useSession();
  const [guild, setGuild] = useState<GuildDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGuild() {
      try {
        const res = await fetch(apiUrl(`/api/dashboard/guilds/${guildId}`));
        if (!res.ok) {
          if (res.status === 401) {
            setError("Please sign in to view this server.");
            return;
          }
          if (res.status === 403) {
            setError("You don't have permission to manage this server.");
            return;
          }
          if (res.status === 404) {
            setError("Server not found or bot is not installed.");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as GuildDetail;
        setGuild(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load server");
      } finally {
        setIsLoading(false);
      }
    }
    fetchGuild();
  }, [guildId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
      </div>
    );
  }

  if (error || !guild) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error ?? "Server not found"}</p>
          <Button variant="depth" className="mt-4" asChild>
            <Link to="/dashboard">Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  const navItems = [
    { to: "/dashboard/$guildId", label: "Overview", icon: LayoutDashboard },
    { to: "/dashboard/$guildId/history", label: "Match History", icon: History },
  ];

  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <aside className="w-full lg:w-64 border-b lg:border-b-0 lg:border-r border-white/10 bg-depth-1">
        <div className="p-6">
          <Button variant="ghost" size="sm" className="mb-6 -ml-2" asChild>
            <Link to="/dashboard">
              <ChevronLeft className="h-4 w-4 mr-1" />
              All Servers
            </Link>
          </Button>

          <div className="flex items-center gap-3 mb-6">
            {guild.guild.icon ? (
              <img
                src={`https://cdn.discordapp.com/icons/${guild.guild.id}/${guild.guild.icon}.png?size=64`}
                alt={guild.guild.name ?? "Server"}
                className="w-10 h-10 rounded-full bg-depth-2"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-depth-2 flex items-center justify-center text-sm font-bold text-muted-foreground">
                {guild.guild.name?.charAt(0).toUpperCase() ?? "?"}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="font-semibold text-sm truncate">
                {guild.guild.name ?? "Unknown Server"}
              </h2>
              <p className="text-xs text-muted-foreground">
                Managing as {session?.user.name ?? "Admin"}
              </p>
            </div>
          </div>

          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                params={{ guildId }}
                activeOptions={{ exact: item.to === "/dashboard/$guildId" }}
                className="flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors hover:bg-white/5 [&.active]:bg-accent-blue/10 [&.active]:text-accent-blue"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <main className="flex-1 p-6 lg:p-8">
        <Outlet />
      </main>
    </div>
  );
}
