import { createFileRoute, Link, Navigate, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bot } from "lucide-react";
import { useAuthMeContext } from "#/components/dashboard/AuthMeProvider";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import { DashboardSessionError } from "#/components/dashboard/DashboardSessionError";
import {
  GuildDashboardProvider,
  type GuildDashboardGuild,
} from "#/components/dashboard/GuildDashboardContext";
import { GuildDashboardShell } from "#/components/dashboard/GuildDashboardShell";
import { GuildSettingsSkeleton } from "#/components/dashboard/GuildSettingsSkeleton";
import { buttonVariants } from "#/components/ui/button";
import {
  fetchGuildSettings,
  getCachedGuildSettings,
  patchCachedGuildSettings,
} from "#/lib/dashboard/guild-settings-cache";
import { prefetchGuildTextChannels } from "#/hooks/useGuildTextChannels";
import { cn } from "#/lib/shared/cn";
import { GlassPanel } from "#/components/ui/glass-panel";
import type { GuildSettingsBundleJson } from "#/lib/dashboard/api-types";

export const Route = createFileRoute("/dashboard/guilds/$guildId")({
  component: GuildDashboardLayout,
});

function GuildDashboardLayout() {
  const { guildId } = Route.useParams();
  const { me, error, retry } = useAuthMeContext();
  const [settings, setSettings] = useState<GuildSettingsBundleJson | null | undefined>(() =>
    getCachedGuildSettings(guildId),
  );
  const [loadError, setLoadError] = useState<string | null>(null);

  const patchSettings = useCallback(
    (partial: Partial<GuildSettingsBundleJson>) => {
      setSettings((prev) => {
        if (!prev) {
          return prev;
        }
        const next = { ...prev, ...partial };
        patchCachedGuildSettings(guildId, partial);
        return next;
      });
    },
    [guildId],
  );

  const guild = useMemo(
    () => me?.guilds.find((g) => g.id === guildId),
    [me, guildId],
  );

  const shellGuild: GuildDashboardGuild | null = useMemo(() => {
    if (!guild) {
      return null;
    }
    return { id: guild.id, name: guild.name, icon: guild.icon, owner: guild.owner };
  }, [guild]);

  useEffect(() => {
    if (!me || !guild?.canManage || !guild.parleyInstalled) {
      return;
    }

    let cancelled = false;
    const cached = getCachedGuildSettings(guildId);
    if (cached) {
      setSettings(cached);
      setLoadError(null);
      prefetchGuildTextChannels(guildId);
      void fetchGuildSettings(guildId, { background: true })
        .then((bundle) => {
          if (!cancelled) {
            setSettings(bundle);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    setSettings(undefined);
    setLoadError(null);
    prefetchGuildTextChannels(guildId);
    fetchGuildSettings(guildId)
      .then((bundle) => {
        if (!cancelled) {
          setSettings(bundle);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setLoadError(e instanceof Error ? e.message : "Failed to load");
          setSettings(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [me, guildId, guild?.canManage, guild?.parleyInstalled]);

  const contextValue = useMemo(() => {
    if (!guild || !me || !settings) {
      return null;
    }
    return {
      guildId,
      guild: shellGuild!,
      user: me.user,
      settings,
      patchSettings,
    };
  }, [guild, guildId, me, patchSettings, settings, shellGuild]);

  if (error && (me === undefined || me === null)) {
    return <DashboardSessionError onRetry={retry} />;
  }

  if (me === undefined) {
    return <DashboardLoader fullScreen />;
  }

  if (!me) {
    return (
      <Navigate
        to="/auth/login"
        search={{ redirect: `/dashboard/guilds/${guildId}/general` }}
        replace
      />
    );
  }

  if (!guild || !guild.canManage) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">You cannot manage this server.</p>
        <Link to="/dashboard" className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  if (!guild.parleyInstalled) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <GlassPanel className="w-full p-8">
          <h1 className="text-lg font-semibold tracking-tight">{guild.name}</h1>
          <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
            Parley is not in this server yet. Add the bot to open guild settings.
          </p>
          {guild.inviteUrl ? (
            <a
              href={guild.inviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(buttonVariants(), "mt-6 inline-flex")}
            >
              <Bot data-icon="inline-start" aria-hidden />
              Add Parley to server
            </a>
          ) : null}
        </GlassPanel>
        <Link to="/dashboard" className="text-primary mt-6 inline-block text-sm underline-offset-4 hover:underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  if (!shellGuild) {
    return <DashboardLoader fullScreen />;
  }

  const shellProps = { guildId, guild: shellGuild, user: me.user };

  if (loadError) {
    return (
      <GuildDashboardShell {...shellProps}>
        <div className="text-center">
          <p className="text-destructive text-sm">{loadError}</p>
          <p className="text-muted-foreground mt-2 text-xs">
            Dev uses remote VPC to the Parley engine. Check Cloudflare login, remote bindings, and engine
            availability.
          </p>
          <Link to="/dashboard" className="text-primary mt-6 inline-block text-sm underline-offset-4 hover:underline">
            Back to dashboard
          </Link>
        </div>
      </GuildDashboardShell>
    );
  }

  if (!settings || !contextValue) {
    return (
      <GuildDashboardShell {...shellProps}>
        <GuildSettingsSkeleton />
      </GuildDashboardShell>
    );
  }

  return (
    <GuildDashboardProvider value={contextValue}>
      <GuildDashboardShell {...shellProps}>
        <div className="dashboard-fade-in">
          <Outlet />
        </div>
      </GuildDashboardShell>
    </GuildDashboardProvider>
  );
}