import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import {
  getGuildNotificationSettings,
  upsertGuildNotificationSettings,
} from "#/lib/server/guild-settings";
import { AuthGuard } from "#/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Switch } from "#/components/ui/switch";

const loadGuildNotificationSettings = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getGuildNotificationSettings(getRequestHeaders(), data.guildId);
  });

const saveGuildNotificationSettings = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return {
      guildId: input.guildId,
      matchResultsChannel:
        typeof input.matchResultsChannel === "string" ? input.matchResultsChannel : undefined,
      tournamentAnnouncementsChannel:
        typeof input.tournamentAnnouncementsChannel === "string"
          ? input.tournamentAnnouncementsChannel
          : undefined,
      leaderboardUpdatesEnabled:
        typeof input.leaderboardUpdatesEnabled === "boolean"
          ? input.leaderboardUpdatesEnabled
          : undefined,
    };
  })
  .handler(async ({ data }) => {
    return upsertGuildNotificationSettings(getRequestHeaders(), data.guildId, {
      matchResultsChannel: data.matchResultsChannel,
      tournamentAnnouncementsChannel: data.tournamentAnnouncementsChannel,
      leaderboardUpdatesEnabled: data.leaderboardUpdatesEnabled,
    });
  });

export const Route = createFileRoute("/guild/$guildId/notifications")({
  loader: ({ params }) => loadGuildNotificationSettings({ data: { guildId: params.guildId } }),
  component: GuildNotificationsRoute,
});

function GuildNotificationsRoute() {
  const { guildId } = Route.useParams();
  const data = Route.useLoaderData();

  const [matchResultsChannel, setMatchResultsChannel] = useState(data?.matchResultsChannel ?? "");
  const [tournamentAnnouncementsChannel, setTournamentAnnouncementsChannel] = useState(
    data?.tournamentAnnouncementsChannel ?? "",
  );
  const [leaderboardUpdatesEnabled, setLeaderboardUpdatesEnabled] = useState(
    data?.leaderboardUpdatesEnabled ?? false,
  );
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  const showToast = (type: "success" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const result = await saveGuildNotificationSettings({
        data: {
          guildId,
          matchResultsChannel: matchResultsChannel || undefined,
          tournamentAnnouncementsChannel: tournamentAnnouncementsChannel || undefined,
          leaderboardUpdatesEnabled,
        },
      });
      if (result) {
        showToast("success", "Notification settings saved successfully.");
      } else {
        showToast("error", "Failed to save notification settings.");
      }
    } catch {
      showToast("error", "An error occurred while saving.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <h1 className="hq-title">Notifications</h1>
        <p className="hq-subtitle">Configure where and how notifications are sent.</p>

        {toast && (
          <div
            className={`mt-4 rounded border px-4 py-3 text-sm ${
              toast.type === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-300"
                : "border-red-500/30 bg-red-500/10 text-red-300"
            }`}
          >
            {toast.message}
          </div>
        )}

        <div className="mt-6 grid gap-6">
          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Channel Settings</CardTitle>
              <CardDescription>Set Discord channels for automated notifications.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <label className="filter-label">Match Results Channel</label>
                <Input
                  type="text"
                  value={matchResultsChannel}
                  onChange={(e) => setMatchResultsChannel(e.target.value)}
                  placeholder="Enter Discord channel ID"
                />
              </div>

              <div className="grid gap-2">
                <label className="filter-label">Tournament Announcements Channel</label>
                <Input
                  type="text"
                  value={tournamentAnnouncementsChannel}
                  onChange={(e) => setTournamentAnnouncementsChannel(e.target.value)}
                  placeholder="Enter Discord channel ID"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Update Preferences</CardTitle>
              <CardDescription>Toggle automated update notifications.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-white/8 bg-white/4 px-4 py-3 transition-colors hover:bg-white/6">
                <span className="text-sm">Leaderboard updates</span>
                <Switch
                  checked={leaderboardUpdatesEnabled}
                  onCheckedChange={(checked) => setLeaderboardUpdatesEnabled(checked)}
                />
              </label>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button className="hq-button" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
