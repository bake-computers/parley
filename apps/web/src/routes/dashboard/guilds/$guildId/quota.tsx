import { createFileRoute } from "@tanstack/react-router";
import { QuotaSettingsForm } from "#/components/dashboard/QuotaSettingsForm";

export const Route = createFileRoute("/dashboard/guilds/$guildId/quota")({
  component: QuotaSettingsPage,
});

function QuotaSettingsPage() {
  return <QuotaSettingsForm />;
}
