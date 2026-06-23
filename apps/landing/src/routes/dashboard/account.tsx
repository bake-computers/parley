import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { UserSettingsForm } from "#/components/dashboard/UserSettingsForm";
import { GlassPanel } from "#/components/ui/glass-panel";
import { discordAvatarUrl } from "#/lib/discord/oauth";
import type { UserSettingsJson } from "#/lib/dashboard/user/types";

type MeResponse = {
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  };
};

export const Route = createFileRoute("/dashboard/account")({
  component: AccountSettingsPage,
});

function AccountSettingsPage() {
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);
  const [settings, setSettings] = useState<UserSettingsJson | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const patchSettings = useCallback((next: UserSettingsJson) => {
    setSettings(next);
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
    if (!me) {
      return;
    }
    let cancelled = false;
    setSettings(undefined);
    setLoadError(null);
    fetch("/api/dashboard/user/settings", { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json()) as { settings?: UserSettingsJson; error?: string };
        if (!res.ok) {
          throw new Error(data.error ?? "Failed to load settings");
        }
        return data.settings!;
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
  }, [me]);

  if (me === undefined || (me && settings === undefined)) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-3xl items-center justify-center px-6 py-16">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }

  if (!me) {
    return <Navigate to="/auth/login" search={{ redirect: "/dashboard/account" }} replace />;
  }

  const displayName = me.user.globalName ?? me.user.username;
  const avatar = discordAvatarUrl(me.user.id, me.user.avatar);

  if (loadError || !settings) {
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
    <main className="mx-auto max-w-3xl px-6 py-12 pb-24">
      <Link
        to="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Dashboard
      </Link>

      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center">
        <img src={avatar} alt="" width={64} height={64} className="size-16 rounded-full ring-1 ring-border" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">@{me.user.username}</p>
        </div>
        <GlassPanel className="px-4 py-2">
          <span className="text-muted-foreground text-xs">Account settings</span>
        </GlassPanel>
      </header>

      <UserSettingsForm settings={settings} onSaved={patchSettings} />
    </main>
  );
}