import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "#/lib/shared/cn";

const SECTIONS = [
  { slug: "general", label: "General" },
  { slug: "matchmakingRules", label: "Matchmaking rules" },
  { slug: "matchQuota", label: "Match quota" },
] as const;

type GuildSettingsNavProps = {
  guildId: string;
  layout?: "tabs" | "sidebar";
};

export function GuildSettingsNav({ guildId, layout = "tabs" }: GuildSettingsNavProps) {
  const activeSection = useRouterState({
    select: (s) => {
      const section = s.location.search.section;
      if (section === "rules") return "matchmakingRules";
      if (section === "quota") return "matchQuota";
      return typeof section === "string" && section ? section : "general";
    },
  });

  return (
    <nav
      aria-label="Guild settings"
      className={cn(layout === "sidebar" ? "flex flex-col gap-1" : "flex flex-wrap gap-2")}
    >
      {SECTIONS.map((section) => {
        const active = activeSection === section.slug;

        return (
          <Link
            key={section.slug}
            to="/dashboard/guilds/$guildId"
            params={{ guildId }}
            search={{ section: section.slug }}
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
