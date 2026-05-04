import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DiscordIcon,
  Loading01Icon,
  ComputerIcon,
  Settings01Icon,
  ArrowRight01Icon,
  Login01Icon,
  Logout01Icon,
  SecurityCheckIcon,
} from "@hugeicons/core-free-icons";
import { authClient } from "#/lib/auth";
import { apiUrl } from "#/lib/api";
import { Button } from "#/components/ui/button";
import {
  Card,
  CardHeader,
  CardContent,
  CardFooter,
} from "#/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "#/components/ui/avatar";

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
  const { data: session, isPending } = authClient.useSession();
  const [guilds, setGuilds] = useState<DashboardGuild[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!session) {
      setIsLoading(false);
      return;
    }

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
  }, [isPending, session]);

  if (isPending || (isLoading && session)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <HugeiconsIcon icon={Loading01Icon} size={32} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-2">
              <HugeiconsIcon icon={Login01Icon} size={28} className="text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-center">
              Welcome to Dashboard
            </h2>
            <p className="text-sm text-muted-foreground text-center">
              Sign in with your Discord account to manage your servers, view
              stats, and configure Parley.
            </p>
          </CardHeader>
          <CardContent>
            <Button
              variant="default"
              className="w-full gap-2"
              onClick={() =>
                authClient.signIn.social({
                  provider: "discord",
                  callbackURL: "/dashboard",
                })
              }
            >
              <HugeiconsIcon
                icon={DiscordIcon}
                size={20}
                strokeWidth={1.5}
              />
              Log in with Discord
            </Button>
          </CardContent>
          <CardFooter className="justify-center">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HugeiconsIcon icon={SecurityCheckIcon} size={14} />
              <span>Secure Discord OAuth authentication</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mx-auto w-14 h-14 rounded-full bg-destructive/10 flex items-center justify-center mb-2">
              <HugeiconsIcon icon={ComputerIcon} size={28} className="text-destructive" />
            </div>
            <h2 className="text-xl font-semibold text-center">Error</h2>
            <p className="text-sm text-muted-foreground text-center">{error}</p>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => window.location.reload()}
            >
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <main className="lp-container py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Welcome back, {session.user.name ?? "Admin"}. Select a server to
            manage.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Avatar>
            {session.user.image ? (
              <AvatarImage
                src={session.user.image}
                alt={session.user.name ?? "User"}
              />
            ) : null}
            <AvatarFallback>
              {session.user.name?.charAt(0).toUpperCase() ?? "U"}
            </AvatarFallback>
          </Avatar>
          <div className="hidden sm:block">
            <p className="text-sm font-medium">{session.user.name}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              await authClient.signOut();
              window.location.reload();
            }}
          >
            <HugeiconsIcon icon={Logout01Icon} size={16} />
            <span className="hidden sm:inline">Log out</span>
          </Button>
        </div>
      </div>

      {guilds.length === 0 ? (
        <Card className="p-8 text-center">
          <HugeiconsIcon icon={ComputerIcon} size={48} className="mx-auto text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold">No Servers Found</h2>
          <p className="text-muted-foreground mt-2 max-w-md mx-auto">
            We couldn&apos;t find any servers where you have admin permissions
            and Parley is installed. Make sure the bot is added to your server
            and you have the Manage Server or Administrator permission.
          </p>
          <Button
            variant="default"
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
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {guilds.map((guild) => (
            <Link
              key={guild.id}
              to="/dashboard/$guildId"
              params={{ guildId: guild.id }}
              className="group"
            >
              <Card className="h-full transition-all duration-200 hover:border-border/80 hover:shadow-md">
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    {guild.icon ? (
                      <img
                        src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`}
                        alt={guild.name ?? "Server"}
                        className="w-12 h-12 rounded-full bg-muted"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold text-muted-foreground">
                        {guild.name?.charAt(0).toUpperCase() ?? "?"}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold truncate">
                        {guild.name ?? "Unknown Server"}
                      </h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Server ID: {guild.id}
                      </p>
                    </div>
                    <HugeiconsIcon icon={Settings01Icon} size={20} className="text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                  <div className="mt-4 flex items-center text-sm text-primary group-hover:underline">
                    Manage Settings
                    <HugeiconsIcon icon={ArrowRight01Icon} size={16} className="ml-1 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}
