import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { apiUrl } from "#/lib/api";
import { authClient } from "#/lib/auth";
import { Badge } from "#/components/ui/badge";
import { Loader2, Settings, Users, Swords, Trophy, LogIn } from "lucide-react";

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
  stats: {
    playerCount: number;
    matchCount: number;
    tournamentCount: number;
  };
}

export const Route = createFileRoute("/dashboard/$guildId/")({
  component: GuildOverview,
});

function GuildOverview() {
  const { guildId } = Route.useParams();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [guild, setGuild] = useState<GuildDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [autoBalance, setAutoBalance] = useState(true);
  const [crossGuildMatchmaking, setCrossGuildMatchmaking] = useState(true);
  const [dailyMatchLimit, setDailyMatchLimit] = useState(10);

  useEffect(() => {
    if (sessionPending) return;
    if (!session) {
      setError("Please sign in to view this server.");
      setIsLoading(false);
      return;
    }

    async function fetchGuild() {
      try {
        const res = await fetch(apiUrl(`/api/dashboard/guilds/${guildId}`));
        if (!res.ok) {
          if (res.status === 401) {
            setError("Please sign in to view this server.");
            return;
          }
          throw new Error(`HTTP ${res.status}`);
        }
        const data = (await res.json()) as GuildDetail;
        setGuild(data);
        if (data.settings) {
          setAutoBalance(data.settings.autoBalance);
          setCrossGuildMatchmaking(data.settings.crossGuildMatchmaking);
        }
        if (data.limits) {
          setDailyMatchLimit(data.limits.dailyMatchLimit);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load server");
      } finally {
        setIsLoading(false);
      }
    }
    fetchGuild();
  }, [guildId, session, sessionPending]);

  async function handleSave() {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/dashboard/guilds/${guildId}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autoBalance,
          crossGuildMatchmaking,
          dailyMatchLimit,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as GuildDetail;
      setGuild(data);
      setSaveMessage("Settings saved successfully.");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-accent-blue" />
      </div>
    );
  }

  if (error) {
    const isAuthError = !session;
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="depth-panel rounded-lg p-8">
            <LogIn className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {isAuthError ? "Authentication Required" : "Error"}
            </h2>
            <p className="text-muted-foreground mb-6">{error}</p>
            {isAuthError ? (
              <Button
                variant="gradient"
                onClick={() => authClient.signIn.social({ provider: "discord" })}
              >
                Sign in with Discord
              </Button>
            ) : (
              <Button variant="depth" onClick={() => window.location.reload()}>
                Retry
              </Button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Server Overview</h1>
        <p className="text-muted-foreground mt-1">
          Manage settings and view stats for {guild?.guild.name}.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="depth-panel rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Users className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Players</span>
          </div>
          <p className="text-2xl font-bold">{guild?.stats.playerCount.toLocaleString() ?? "--"}</p>
        </div>
        <div className="depth-panel rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Swords className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Matches</span>
          </div>
          <p className="text-2xl font-bold">{guild?.stats.matchCount.toLocaleString() ?? "--"}</p>
        </div>
        <div className="depth-panel rounded-lg p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-2">
            <Trophy className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Tournaments</span>
          </div>
          <p className="text-2xl font-bold">
            {guild?.stats.tournamentCount.toLocaleString() ?? "--"}
          </p>
        </div>
      </div>

      <div className="depth-panel rounded-lg p-6 space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-accent-blue" />
          <h2 className="text-lg font-semibold">Server Settings</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Auto Balance</h3>
              <p className="text-sm text-muted-foreground">
                Automatically balance teams based on ELO when creating matches.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={autoBalance}
              onClick={() => setAutoBalance((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                autoBalance ? "bg-accent-blue" : "bg-depth-3"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  autoBalance ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="h-px bg-white/5" />

          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">Cross-Server Matchmaking</h3>
              <p className="text-sm text-muted-foreground">
                Allow matchmaking queues to match with other servers.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={crossGuildMatchmaking}
              onClick={() => setCrossGuildMatchmaking((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                crossGuildMatchmaking ? "bg-accent-blue" : "bg-depth-3"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  crossGuildMatchmaking ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          <div className="h-px bg-white/5" />

          <div>
            <h3 className="font-medium">Daily Match Limit</h3>
            <p className="text-sm text-muted-foreground mb-3">
              Maximum number of matches that can be recorded per day.
            </p>
            <input
              type="number"
              min={1}
              max={1000}
              value={dailyMatchLimit}
              onChange={(e) => setDailyMatchLimit(parseInt(e.target.value, 10) || 0)}
              className="w-full sm:w-48 rounded-md border border-white/10 bg-depth-1 py-2 px-3 text-sm text-foreground focus:border-accent-blue focus:outline-none focus:ring-1 focus:ring-accent-blue/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 pt-2">
          <Button variant="gradient" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
          {saveMessage && (
            <Badge variant="gradient-mixed" className="text-xs">
              {saveMessage}
            </Badge>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}
