import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "#/lib/shared/cn";

const SECTIONS = [
  { slug: "general", label: "General" },
  { slug: "rules", label: "Matchmaking rules" },
  { slug: "quota", label: "Match quota" },
] as const;

type GuildSettingsNavProps = {
  guildId: string;
  layout?: "tabs" | "sidebar";
};

function sectionTo(guildId: string, slug: (typeof SECTIONS)[number]["slug"]) {
  return slug === "general"
    ? "/dashboard/guilds/$guildId/general"
    : slug === "rules"
      ? "/dashboard/guilds/$guildId/rules"
      : "/dashboard/guilds/$guildId/quota";
}

export function GuildSettingsNav({ guildId, layout = "tabs" }: GuildSettingsNavProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav
      aria-label="Guild settings"
      className={cn(layout === "sidebar" ? "flex flex-col gap-1" : "flex flex-wrap gap-2")}
    >
      {SECTIONS.map((section) => {
        const href = `/dashboard/guilds/${guildId}/${section.slug}`;
        const active = pathname === href || pathname.endsWith(`/${section.slug}`);

        return (
          <Link
            key={section.slug}
            to={sectionTo(guildId, section.slug)}
            params={{ guildId }}
            className={cn(
              "text-sm font-medium transition-colors",
              layout === "sidebar"
                ? cn(
                    "rounded-xl px-3 py-2.5",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )
                : cn(
                    "rounded-full px-4 py-2",
                    active
                      ? "bg-foreground text-background"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  ),
            )}
          >
            {section.label}
          </Link>
        );
      })}
    </nav>
  );
}
