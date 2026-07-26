import { createFileRoute } from "@tanstack/react-router";
import { GeneralSettingsForm } from "#/components/dashboard/GeneralSettingsForm";

export const Route = createFileRoute("/dashboard/guilds/$guildId/general")({
  component: GeneralSettingsPage,
});

function GeneralSettingsPage() {
  return <GeneralSettingsForm />;
}
