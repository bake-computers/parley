import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuthMeProvider, useAuthMeContext } from "#/components/dashboard/AuthMeProvider";
import { DashboardLoader } from "#/components/dashboard/DashboardLoader";
import { DashboardSessionError } from "#/components/dashboard/DashboardSessionError";
import { GuildCard } from "#/components/dashboard/GuildCard";
import { GlassPanel } from "#/components/ui/glass-panel";
import { useAuthMe, type AuthMeGuild } from "#/hooks/useAuthMe";
import { prefetchGuildSettings } from "#/lib/dashboard/guild-settings-cache";
import { partitionDashboardGuilds } from "#/lib/discord/guild-dashboard";
import { discordAvatarUrl } from "#/lib/discord/oauth";
import { cn } from "#/lib/shared/cn";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const auth = useAuthMe();
  const isIndex = useRouterState({
    select: (s) => {
      const path = s.location.pathname;
      return path === "/dashboard" || path === "/dashboard/";
    },
  });

  if (auth.error && (auth.me === undefined || auth.me === null)) {
    return <DashboardSessionError onRetry={auth.retry} />;
  }

  if (auth.me === undefined) {
    return <DashboardLoader label="Loading session…" />;
  }

  if (!auth.me) {
    return <Navigate to="/auth/login" search={{ redirect: "/dashboard" }} replace />;
  }

  return <AuthMeProvider value={auth}>{isIndex ? <DashboardIndex /> : <Outlet />}</AuthMeProvider>;
}

function GuildGrid({ guilds }: { guilds: AuthMeGuild[] }) {
  return (
    <ul className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
      {guilds.map((g) => (
        <li key={g.id} className="min-h-0">
          <GuildCard
            id={g.id}
            name={g.name}
            icon={g.icon}
            owner={g.owner}
            canManage={g.canManage}
            parleyInstalled={g.parleyInstalled}
            inviteUrl={g.inviteUrl}
          />
        </li>
      ))}
    </ul>
  );
}

function DashboardIndex() {
  const { me } = useAuthMeContext();
  const [showOtherGuilds, setShowOtherGuilds] = useState(false);

  const { primary, other } = useMemo(
    () => partitionDashboardGuilds(me?.guilds ?? []),
    [me?.guilds],
  );

  const counts = useMemo(() => {
    const ready = primary.filter((g) => g.parleyInstalled).length;
    const needsBot = primary.length - ready;
    return {
      total: primary.length + other.length,
      ready,
      needsBot,
      locked: other.length,
    };
  }, [primary, other]);

  useEffect(() => {
    if (!me) {
      return;
    }
    for (const g of me.guilds) {
      if (g.canManage && g.parleyInstalled) {
        prefetchGuildSettings(g.id);
      }
    }
  }, [me]);

  if (!me) {
    return null;
  }

  const displayName = me.user.globalName ?? me.user.username;
  const avatar = discordAvatarUrl(me.user.id, me.user.avatar);

  return (
    <main className="dashboard-fade-in mx-auto min-h-[50vh] max-w-6xl px-6 py-12 pb-20">
      <header className="mb-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-4">
          <Link to="/dashboard/account" className="transition-opacity hover:opacity-90">
            <img
              src={avatar}
              alt=""
              width={72}
              height={72}
              className="size-[4.5rem] rounded-full ring-2 ring-border"
            />
          </Link>
          <div>
            <Link to="/dashboard/account" className="hover:opacity-90">
              <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
              <p className="text-muted-foreground text-sm">@{me.user.username}</p>
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-sm">
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Home
          </Link>
          <a
            href="/auth/logout"
            className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
          >
            Sign out
          </a>
        </div>
      </header>

      <section>
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Your Discord servers</h2>
            <p className="text-muted-foreground mt-1 max-w-xl text-sm">
              {counts.total === 0
                ? "No servers on this account. Join a Discord server first, then sign in again."
                : primary.length === 0
                  ? `${counts.locked} server${counts.locked === 1 ? "" : "s"} without manage access.`
                  : `${primary.length} server${primary.length === 1 ? "" : "s"} you can manage — ${counts.needsBot} need Parley, ${counts.ready} ready.`}
            </p>
          </div>
          {counts.total > 0 ? (
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="bg-primary/10 text-primary rounded-full px-3 py-1 font-medium">
                {counts.ready} configured
              </span>
              <span className="bg-amber-500/10 text-amber-800 dark:text-amber-200 rounded-full px-3 py-1 font-medium">
                {counts.needsBot} add bot
              </span>
              <span className="bg-muted text-muted-foreground rounded-full px-3 py-1 font-medium">
                {counts.locked} locked
              </span>
            </div>
          ) : null}
        </div>

        {counts.total === 0 ? (
          <GlassPanel className="p-8 text-center">
            <p className="text-muted-foreground text-sm">
              Join a Discord server, then sign in again to see it here.
            </p>
          </GlassPanel>
        ) : (
          <div className="space-y-8">
            {primary.length > 0 ? <GuildGrid guilds={primary} /> : null}

            {other.length > 0 ? (
              <div className="border-border/60 border-t pt-6">
                <button
                  type="button"
                  onClick={() => setShowOtherGuilds((open) => !open)}
                  className="text-muted-foreground hover:text-foreground flex w-full items-center justify-between gap-3 rounded-lg py-2 text-left text-sm transition-colors"
                  aria-expanded={showOtherGuilds}
                >
                  <span>
                    Other servers ({other.length})
                    <span className="mt-0.5 block text-xs font-normal opacity-80">
                      View only — no manage access
                    </span>
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 transition-transform duration-200",
                      showOtherGuilds && "rotate-180",
                    )}
                    aria-hidden
                  />
                </button>
                <div
                  className={cn(
                    "grid transition-[grid-template-rows] duration-200 ease-out",
                    showOtherGuilds ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="pt-4">
                      <GuildGrid guilds={other} />
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </main>
  );
}
