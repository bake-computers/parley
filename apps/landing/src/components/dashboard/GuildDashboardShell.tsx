import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { discordAvatarUrl, discordGuildIconUrl } from "#/lib/discord/oauth";
import { useGuildDashboard } from "./GuildDashboardContext";
import { GuildSettingsNav } from "./GuildSettingsNav";

export function GuildDashboardShell({ children }: { children: React.ReactNode }) {
  const { guildId, guild, user } = useGuildDashboard();
  const iconUrl = discordGuildIconUrl(guild.id, guild.icon);
  const avatar = discordAvatarUrl(user.id, user.avatar);

  return (
    <main className="mx-auto max-w-3xl px-6 py-12 pb-16">
      <Link
        to="/dashboard"
        className="text-muted-foreground hover:text-foreground mb-8 inline-flex items-center gap-2 text-sm transition-colors"
      >
        <ArrowLeft className="size-4" aria-hidden />
        All servers
      </Link>

      <header className="mb-8 flex flex-col gap-6 sm:flex-row sm:items-center">
        {iconUrl ? (
          <img src={iconUrl} alt="" width={64} height={64} className="size-16 rounded-2xl ring-1 ring-border" />
        ) : (
          <div className="bg-muted flex size-16 items-center justify-center rounded-2xl text-lg font-semibold">
            {guild.name.slice(0, 2).toUpperCase()}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold tracking-tight">{guild.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">Rainbow Six Siege · Guild settings</p>
        </div>
        <Link to="/dashboard/account" className="transition-opacity hover:opacity-90">
          <GlassPanel className="flex items-center gap-3 px-4 py-2">
            <img src={avatar} alt="" width={32} height={32} className="size-8 rounded-full" />
            <span className="text-muted-foreground text-xs">{user.globalName ?? user.username}</span>
          </GlassPanel>
        </Link>
      </header>

      <GuildSettingsNav guildId={guildId} />
      {children}
    </main>
  );
}