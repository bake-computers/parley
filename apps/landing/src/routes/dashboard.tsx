import { createFileRoute, Link, Navigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GuildCard } from "#/components/dashboard/GuildCard";
import { GlassPanel } from "#/components/ui/glass-panel";
import { discordAvatarUrl } from "#/lib/discord-oauth";

type MeGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
};

type MeResponse = {
  user: {
    id: string;
    username: string;
    globalName: string | null;
    avatar: string | null;
  };
  guilds: MeGuild[];
  expiresAtMs: number;
};

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const isIndex = useRouterState({
    select: (s) => {
      const path = s.location.pathname;
      return path === "/dashboard" || path === "/dashboard/";
    },
  });
  return isIndex ? <DashboardIndex /> : <Outlet />;
}

function DashboardIndex() {
  const [me, setMe] = useState<MeResponse | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          return null;
        }
        return (await res.json()) as MeResponse;
      })
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

  if (me === undefined) {
    return (
      <main className="mx-auto flex min-h-[50vh] max-w-lg flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-muted-foreground text-sm">Loading session…</p>
      </main>
    );
  }

  if (!me) {
    return <Navigate to="/auth/login" search={{ redirect: "/dashboard" }} replace />;
  }

  const displayName = me.user.globalName ?? me.user.username;
  const avatar = discordAvatarUrl(me.user.id, me.user.avatar);

  return (
    <main className="mx-auto min-h-[50vh] max-w-5xl px-6 py-12 pb-20">
      <header className="mb-12 flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
        <Link to="/dashboard/account" className="transition-opacity hover:opacity-90">
          <img
            src={avatar}
            alt=""
            width={72}
            height={72}
            className="size-[4.5rem] rounded-full ring-2 ring-border"
          />
        </Link>
        <div className="flex-1">
          <Link to="/dashboard/account" className="hover:opacity-90">
            <h1 className="text-2xl font-semibold tracking-tight">{displayName}</h1>
            <p className="text-muted-foreground text-sm">@{me.user.username}</p>
          </Link>
        </div>
        <div className="flex gap-4 text-sm">
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
        <div className="mb-6">
          <h2 className="text-lg font-semibold tracking-tight">Your servers</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            {me.guilds.length === 0
              ? "No servers with Manage Server, Administrator, or owner on this account."
              : `${me.guilds.length} server${me.guilds.length === 1 ? "" : "s"} you can configure`}
          </p>
        </div>

        {me.guilds.length === 0 ? (
          <GlassPanel className="p-8 text-center">
            <p className="text-muted-foreground text-sm">
              Invite Parley to a server where you have Manage Server permission, then sign in again.
            </p>
          </GlassPanel>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {me.guilds.map((g) => (
              <li key={g.id}>
                <GuildCard id={g.id} name={g.name} icon={g.icon} owner={g.owner} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}