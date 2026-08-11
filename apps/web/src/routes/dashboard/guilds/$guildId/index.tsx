import { createFileRoute } from "@tanstack/react-router";
import { GuildSettingsCatalog } from "#/components/dashboard/GuildSettingsCatalog";

export const Route = createFileRoute("/dashboard/guilds/$guildId/")({
  validateSearch: (search: Record<string, unknown>) => ({
    section: typeof search.section === "string" ? search.section : undefined,
  }),
  component: GuildSettingsIndex,
});

function GuildSettingsIndex() {
  const { section } = Route.useSearch();
  return <GuildSettingsCatalog initialSection={section} />;
}
