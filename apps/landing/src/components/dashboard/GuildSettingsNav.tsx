import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

const SECTIONS = [
  { slug: "general", label: "General" },
  { slug: "rules", label: "Matchmaking rules" },
  { slug: "notifications", label: "Notifications" },
  { slug: "quota", label: "Match quota" },
] as const;

export function GuildSettingsNav({ guildId }: { guildId: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav aria-label="Guild settings" className="mb-8 flex flex-wrap gap-2">
      {SECTIONS.map((section) => {
        const href = `/dashboard/guilds/${guildId}/${section.slug}`;
        const active = pathname === href || pathname.endsWith(`/${section.slug}`);
        const to =
          section.slug === "general"
            ? "/dashboard/guilds/$guildId/general"
            : section.slug === "rules"
              ? "/dashboard/guilds/$guildId/rules"
              : section.slug === "notifications"
                ? "/dashboard/guilds/$guildId/notifications"
                : "/dashboard/guilds/$guildId/quota";

        return (
          <Link
            key={section.slug}
            to={to}
            params={{ guildId }}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}