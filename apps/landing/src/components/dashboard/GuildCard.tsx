import { Link } from "@tanstack/react-router";
import { Bot, ChevronRight, Crown, Lock, Shield } from "lucide-react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { buttonVariants } from "#/components/ui/button";
import { prefetchGuildSettings } from "#/lib/dashboard/guild-settings-cache";
import { discordGuildIconUrl } from "#/lib/discord/oauth";
import { cn } from "#/lib/shared/cn";

export type GuildCardProps = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  canManage: boolean;
  parleyInstalled: boolean;
  inviteUrl: string | null;
};

function GuildIcon({ id, name, icon }: Pick<GuildCardProps, "id" | "name" | "icon">) {
  const iconUrl = discordGuildIconUrl(id, icon);
  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt=""
        width={48}
        height={48}
        className="size-12 shrink-0 rounded-xl ring-1 ring-border"
      />
    );
  }
  return (
    <div
      className={cn(
        "bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-xl text-sm font-semibold tracking-tight",
      )}
    >
      {name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function RoleLabel({ owner, canManage }: Pick<GuildCardProps, "owner" | "canManage">) {
  if (!canManage) {
    return (
      <>
        <Lock className="size-3.5 opacity-70" aria-hidden />
        No manage access
      </>
    );
  }
  if (owner) {
    return (
      <>
        <Crown className="size-3.5 opacity-70" aria-hidden />
        Owner
      </>
    );
  }
  return (
    <>
      <Shield className="size-3.5 opacity-70" aria-hidden />
      Manage Server
    </>
  );
}

function StatusPill({
  canManage,
  parleyInstalled,
}: Pick<GuildCardProps, "canManage" | "parleyInstalled">) {
  if (!canManage) {
    return (
      <span className="bg-muted/80 text-muted-foreground rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase">
        View only
      </span>
    );
  }
  if (parleyInstalled) {
    return (
      <span className="bg-primary/15 text-primary rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase">
        Ready
      </span>
    );
  }
  return (
    <span className="bg-amber-500/15 text-amber-700 dark:text-amber-300 rounded-full px-2.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase">
      Add Parley
    </span>
  );
}

function cardDescription({
  canManage,
  parleyInstalled,
}: Pick<GuildCardProps, "canManage" | "parleyInstalled">): string {
  if (!canManage) {
    return "You need Manage Server or Administrator to configure Parley on this server.";
  }
  if (parleyInstalled) {
    return "Matchmaking, notifications, quotas, and Parley defaults for Rainbow Six Siege.";
  }
  return "Parley is not in this server yet. Add the bot to unlock guild settings.";
}

export function GuildCard({
  id,
  name,
  icon,
  owner,
  canManage,
  parleyInstalled,
  inviteUrl,
}: GuildCardProps) {
  const showInvite = canManage && !parleyInstalled && inviteUrl;
  const showChevron = canManage && parleyInstalled;

  const body = (
    <GlassPanel
      className={cn(
        "flex h-full min-h-[11.5rem] flex-col gap-3 p-4 sm:gap-4 sm:p-5",
        "transition-[border-color,transform,opacity] duration-200",
        canManage && parleyInstalled && "group-hover:border-primary/30 group-active:scale-[0.99]",
        !canManage && "opacity-75",
      )}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <GuildIcon id={id} name={name} icon={icon} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{name}</p>
            <StatusPill canManage={canManage} parleyInstalled={parleyInstalled} />
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-1.5 text-xs">
            <RoleLabel owner={owner} canManage={canManage} />
          </p>
        </div>
        {showChevron ? (
          <ChevronRight
            className="text-muted-foreground size-5 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        ) : null}
      </div>

      <p className="text-muted-foreground flex-1 text-xs leading-relaxed">
        {cardDescription({ canManage, parleyInstalled })}
      </p>

      <div className="mt-auto min-h-9 shrink-0">
        {showInvite ? (
          <a
            href={inviteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ size: "sm" }), "w-full sm:w-auto")}
          >
            <Bot data-icon="inline-start" aria-hidden />
            Add Parley
          </a>
        ) : null}
      </div>
    </GlassPanel>
  );

  if (canManage && parleyInstalled) {
    return (
      <Link
        to="/dashboard/guilds/$guildId/general"
        params={{ guildId: id }}
        className="group block h-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50 rounded-2xl"
        onMouseEnter={() => prefetchGuildSettings(id)}
        onFocus={() => prefetchGuildSettings(id)}
      >
        {body}
      </Link>
    );
  }

  return <div className="h-full rounded-2xl">{body}</div>;
}
