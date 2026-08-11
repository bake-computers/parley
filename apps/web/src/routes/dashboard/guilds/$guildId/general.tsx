import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/guilds/$guildId/general")({
  component: GeneralSettingsRedirect,
});

function GeneralSettingsRedirect() {
  const { guildId } = Route.useParams();
  return (
    <Navigate
      to="/dashboard/guilds/$guildId"
      params={{ guildId }}
      search={{ section: "general" }}
      replace
    />
  );
}
