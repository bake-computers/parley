import { Link } from "@tanstack/react-router";
import { ChevronRight, Crown, Shield } from "lucide-react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { discordGuildIconUrl } from "#/lib/discord-oauth";
import { cn } from "#/lib/utils";

export type GuildCardProps = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
};

export function GuildCard({ id, name, icon, owner }: GuildCardProps) {
  const iconUrl = discordGuildIconUrl(id, icon);

  return (
    <Link
      to="/dashboard/guilds/$guildId/general"
      params={{ guildId: id }}
      className="group block outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-2xl"
    >
      <GlassPanel className="flex h-full flex-col gap-4 p-5 transition-[border-color,transform] duration-200 group-hover:border-primary/30 group-active:scale-[0.99]">
        <div className="flex items-start gap-4">
          {iconUrl ? (
            <img
              src={iconUrl}
              alt=""
              width={48}
              height={48}
              className="size-12 shrink-0 rounded-xl ring-1 ring-border"
            />
          ) : (
            <div
              className={cn(
                "bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold tracking-tight",
              )}
            >
              {name.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-base font-semibold tracking-tight">{name}</p>
            <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
              {owner ? (
                <>
                  <Crown className="size-3.5 opacity-70" aria-hidden />
                  Owner
                </>
              ) : (
                <>
                  <Shield className="size-3.5 opacity-70" aria-hidden />
                  Manage Server
                </>
              )}
            </p>
          </div>
          <ChevronRight
            className="text-muted-foreground size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </div>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Matchmaking, notifications, quotas, and Parley defaults for Rainbow Six Siege.
        </p>
      </GlassPanel>
    </Link>
  );
}