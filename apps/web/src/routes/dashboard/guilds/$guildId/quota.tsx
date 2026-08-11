import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/dashboard/guilds/$guildId/quota")({
  component: QuotaSettingsRedirect,
});

function QuotaSettingsRedirect() {
  const { guildId } = Route.useParams();
  return (
    <Navigate
      to="/dashboard/guilds/$guildId"
      params={{ guildId }}
      search={{ section: "matchQuota" }}
      replace
    />
  );
}
