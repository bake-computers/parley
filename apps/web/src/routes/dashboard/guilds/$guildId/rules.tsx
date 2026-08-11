import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/guilds/$guildId/rules")({
  component: RulesSettingsRedirect,
});

function RulesSettingsRedirect() {
  const { guildId } = Route.useParams();
  return (
    <Navigate
      to="/dashboard/guilds/$guildId"
      params={{ guildId }}
      search={{ section: "matchmakingRules" }}
      replace
    />
  );
}
