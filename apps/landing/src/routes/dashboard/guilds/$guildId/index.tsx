import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/guilds/$guildId/")({
  component: GuildSettingsIndex,
});

function GuildSettingsIndex() {
  const { guildId } = Route.useParams();
  return <Navigate to="/dashboard/guilds/$guildId/general" params={{ guildId }} replace />;
}