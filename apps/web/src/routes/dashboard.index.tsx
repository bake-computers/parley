import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { authClient } from "#/lib/auth";
import { apiUrl } from "#/lib/api";
import { Button } from "#/components/ui/button";
import { Loader2, Server, Settings, ChevronRight } from "lucide-react";

interface DashboardGuild {
  id: string;
  name: string | null;
  icon: string | null;
  permissions: number;
  botPresent: boolean;
}

export const Route = createFileRoute("/dashboard/")({
  component: DashboardIndex,
});

function DashboardIndex() {
  const { data: session } = authClient.useSession();
  const [guilds, setGuilds] = useState<DashboardGuild[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchGuilds() {
      try {
        const res = await fetch(apiUrl("/api/dashboard/guilds"));
        if (!res.ok) {
          if (res.status === 401) {
            setError("Please sign in to view your servers.");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as { guilds: DashboardGuild[] };
        setGuilds(data.guilds);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load servers");
      } finally {
        setIsLoading(false);
      }
    }
    fetchGuilds();
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{error}</p>
          <Button variant="depth" className="mt-4" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <main className="lp-container py-12">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back, {session?.user.name ?? "Admin"}. Select a server to manage.
        </p>
      </div>

      {guilds.length === 0 ? (
        <div className="depth-panel rounded-lg p-8 text-center">
          <Server className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No Servers Found</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            We couldn&apos;t find any servers where you have admin permissions and Parley is
            installed. Make sure the bot is added to your server and you have the Manage Server or
            Administrator permission.
          </p>
          <Button
            variant="gradient"
            className="mt-6"
            onClick={() => {
              window.open(
                "https://discord.com/oauth2/authorize?client_id=PLACEHOLDER&scope=bot",
                "_blank",
              );
            }}
          >
            Add Parley to Discord
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {guilds.map((guild) => (
            <Link
              key={guild.id}
              to="/dashboard/$guildId"
              params={{ guildId: guild.id }}
              className="depth-panel rounded-lg p-6 transition-all duration-200 hover:border-accent-blue/30 hover:shadow-[0_0_20px_rgba(59,130,246,0.1)] group"
            >
              <div className="flex items-start gap-4">
                {guild.icon ? (
                  <img
                    src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                    alt={guild.name ?? "Server"}
                    className="w-12 h-12 rounded-full bg-depth-2"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-depth-2 flex items-center justify-center text-lg font-bold text-muted-foreground">
                    {guild.name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold truncate">{guild.name ?? "Unknown Server"}</h3>
                  <p className="text-sm text-muted-foreground mt-1">Server ID: {guild.id}</p>
                </div>
                <Settings className="h-5 w-5 text-muted-foreground group-hover:text-accent-blue transition-colors" />
              </div>
              <div className="mt-4 flex items-center text-sm text-accent-blue group-hover:underline">
                Manage Settings
                <ChevronRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
