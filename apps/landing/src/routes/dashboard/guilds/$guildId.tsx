import { createFileRoute, Link, Navigate, Outlet } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  GuildDashboardProvider,
  type GuildDashboardGuild,
  type GuildDashboardUser,
} from "#/components/dashboard/GuildDashboardContext";
import { GuildDashboardShell } from "#/components/dashboard/GuildDashboardShell";
import type { GuildSettingsBundleJson } from "#/lib/dashboard/api-types";

type MeGuild = GuildDashboardGuild;

type MeResponse = {
  user: GuildDashboardUser;
  guilds: MeGuild[];
};

export const Route = createFileRoute("/dashboard/guilds/$guildId")({
  component: GuildDashboardLayout,
});

function GuildDashboardLayout() {
  const { guildId } = Route.useParams();
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);
  const [settings, setSettings] = useState<GuildSettingsBundleJson | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const patchSettings = useCallback((partial: Partial<GuildSettingsBundleJson>) => {
    setSettings((prev) => (prev ? { ...prev, ...partial } : prev));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => (res.ok ? ((await res.json()) as MeResponse) : null))
      .then((data) => {
        if (!cancelled) {
          setMe(data?.user ? data : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMe(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (me === undefined || me === null) {
      return;
    }
    const guild = me.guilds.find((g) => g.id === guildId);
    if (!guild) {
      setSettings(null);
      return;
    }

    let cancelled = false;
    setSettings(undefined);
    setLoadError(null);
    fetch(`/api/dashboard/guilds/${guildId}/settings`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as GuildSettingsBundleJson & { error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load settings");
        }
        return data;
      })
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
  }, [me, guildId]);

  const guild = useMemo(
    () => me?.guilds.find((g) => g.id === guildId),
    [me, guildId],
  );

  const contextValue = useMemo(() => {
    if (!guild || !me || !settings) {
      return null;
    }
    return {
      guildId,
      guild,
      user: me.user,
      settings,
      patchSettings,
    };
  }, [guild, guildId, me, patchSettings, settings]);

  if (me === undefined || (me && settings === undefined)) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-6 py-16">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
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

  if (!guild) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">You cannot manage this server.</p>
        <Link to="/dashboard" className="text-primary mt-4 inline-block text-sm underline-offset-4 hover:underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  if (loadError || !settings || !contextValue) {
    return (
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        <p className="text-destructive text-sm">{loadError ?? "Settings unavailable"}</p>
        <p className="text-muted-foreground mt-2 text-xs">
          Dev uses remote VPC to the Parley engine. Check Cloudflare login, remote bindings, and engine
          availability.
        </p>
        <Link to="/dashboard" className="text-primary mt-6 inline-block text-sm underline-offset-4 hover:underline">
          Back to dashboard
        </Link>
      </main>
    );
  }

  return (
    <GuildDashboardProvider value={contextValue}>
      <GuildDashboardShell>
        <Outlet />
      </GuildDashboardShell>
    </GuildDashboardProvider>
  );
}