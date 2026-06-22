import { createFileRoute } from "@tanstack/react-router";
import { NotificationsSettingsForm } from "#/components/dashboard/NotificationsSettingsForm";

export const Route = createFileRoute("/dashboard/guilds/$guildId/notifications")({
  component: NotificationsSettingsPage,
});

function NotificationsSettingsPage() {
  return <NotificationsSettingsForm />;
}