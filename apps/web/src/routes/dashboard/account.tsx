import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useAuthMeContext } from "#/components/dashboard/AuthMeProvider";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import { DashboardSessionError } from "#/components/dashboard/DashboardSessionError";
import { UserSettingsForm } from "#/components/dashboard/UserSettingsForm";
import { GlassPanel } from "#/components/ui/glass-panel";
import { Skeleton } from "#/components/ui/skeleton";
import {
  fetchUserSettings,
  getCachedUserSettings,
  setCachedUserSettings,
} from "#/lib/dashboard/user-settings-cache";
import { discordAvatarUrl } from "#/lib/discord/oauth";
import type { UserSettingsJson } from "#/lib/dashboard/user/types";

export const Route = createFileRoute("/dashboard/account")({
  component: AccountSettingsPage,
});

function AccountSettingsSkeleton() {
  return (
    <GlassPanel className="flex flex-col gap-5 p-6" role="status" aria-label="Loading settings">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-[66%]" />
    </GlassPanel>
  );
}

function AccountSettingsPage() {
  const { me, error, retry } = useAuthMeContext();
  const [settings, setSettings] = useState<UserSettingsJson | null | undefined>();
  const [loadError, setLoadError] = useState<string | null>(null);

  const patchSettings = useCallback((next: UserSettingsJson) => {
    setCachedUserSettings(next);
    setSettings(next);
  }, []);

  useEffect(() => {
    if (!me) {
      return;
    }
    const cached = getCachedUserSettings();
    if (cached) {
      setSettings(cached);
      setLoadError(null);
      return;
    }
    let cancelled = false;
    setSettings(undefined);
    setLoadError(null);
    fetchUserSettings()
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

  if (error && (me === undefined || me === null)) {
    return <DashboardSessionError onRetry={retry} />;
  }

  if (me === undefined) {
    return <DashboardLoader />;
  }

  if (!me) {
    return <Navigate to="/auth/login" search={{ redirect: "/dashboard/account" }} replace />;
  }

  const displayName = me.user.globalName ?? me.user.username;
  const avatar = discordAvatarUrl(me.user.id, me.user.avatar, 256);

  return (
    <main className="dashboard-fade-in mx-auto max-w-3xl px-6 py-12 pb-24">
      <Link
        to="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Dashboard
      </Link>

      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center">
        <img
          src={avatar}
          alt=""
          width={64}
          height={64}
          className="size-16 rounded-full ring-1 ring-border"
        />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{displayName}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            <a
              href={`/@${encodeURIComponent(me.user.username)}`}
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              @{me.user.username}
            </a>
          </p>
        </div>
        <GlassPanel className="px-4 py-2">
          <span className="text-muted-foreground text-xs">Account settings</span>
        </GlassPanel>
      </header>

      {loadError ? (
        <div className="text-center">
          <p className="text-destructive text-sm">{loadError}</p>
          {/ENGINE_SHARED_SECRET|VPC_SERVICE|engine|authentication|forbidden/i.test(loadError) ? (
            <p className="text-muted-foreground mt-2 text-xs">
              Account settings load over the Cloudflare VPC binding to the Parley engine. Confirm
              ENGINE_SHARED_SECRET is set on the web worker (same value as the engine) and the
              engine is reachable.
            </p>
          ) : null}
        </div>
      ) : settings ? (
        <UserSettingsForm settings={settings} onSaved={patchSettings} />
      ) : (
        <AccountSettingsSkeleton />
      )}
    </main>
  );
}
