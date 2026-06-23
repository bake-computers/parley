import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { discordAvatarUrl, discordGuildIconUrl } from "#/lib/discord/oauth";
import type { GuildDashboardGuild, GuildDashboardUser } from "./GuildDashboardContext";
import { GuildSettingsNav } from "./GuildSettingsNav";

type GuildDashboardShellProps = {
  guildId: string;
  guild: GuildDashboardGuild;
  user: GuildDashboardUser;
  children: React.ReactNode;
};

export function GuildDashboardShell({ guildId, guild, user, children }: GuildDashboardShellProps) {
  const iconUrl = discordGuildIconUrl(guild.id, guild.icon);
  const avatar = discordAvatarUrl(user.id, user.avatar);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-border/60 bg-background/80 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="flex items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            to="/dashboard"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-2 text-sm transition-colors"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="hidden sm:inline">All servers</span>
          </Link>
          <div className="bg-border/80 hidden h-5 w-px sm:block" aria-hidden />
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {iconUrl ? (
              <img
                src={iconUrl}
                alt=""
                width={40}
                height={40}
                className="size-10 shrink-0 rounded-xl ring-1 ring-border"
              />
            ) : (
              <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold">
                {guild.name.slice(0, 2).toUpperCase()}
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold tracking-tight sm:text-lg">
                {guild.name}
              </h1>
              <p className="text-muted-foreground hidden text-xs sm:block">
                Rainbow Six Siege · Guild settings
              </p>
            </div>
          </div>
          <Link to="/dashboard/account" className="shrink-0 transition-opacity hover:opacity-90">
            <img src={avatar} alt="" width={32} height={32} className="size-8 rounded-full ring-1 ring-border" />
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="border-border/60 hidden w-56 shrink-0 border-r px-3 py-6 lg:block xl:w-64">
          <GuildSettingsNav guildId={guildId} layout="sidebar" />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto">
          <div className="border-border/60 border-b px-4 py-4 lg:hidden">
            <GuildSettingsNav guildId={guildId} layout="tabs" />
          </div>
          <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:px-10 lg:py-10 xl:max-w-5xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}