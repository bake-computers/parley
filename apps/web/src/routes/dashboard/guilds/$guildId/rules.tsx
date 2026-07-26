import { createFileRoute } from "@tanstack/react-router";
import { RulesSettingsForm } from "#/components/dashboard/RulesSettingsForm";

export const Route = createFileRoute("/dashboard/guilds/$guildId/rules")({
  component: RulesSettingsPage,
});

function RulesSettingsPage() {
  return <RulesSettingsForm />;
}
