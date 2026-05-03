import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getGuildSettings, upsertGuildSettings } from "#/lib/server/guild-settings";
import { AuthGuard } from "#/components/auth-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { Button } from "#/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "#/components/ui/select";

const loadGuildSettings = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getGuildSettings(getRequestHeaders(), data.guildId);
  });

const saveGuildSettings = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return {
      guildId: input.guildId,
      dailyMatchLimit:
        typeof input.dailyMatchLimit === "number" ? input.dailyMatchLimit : undefined,
      defaultTeamFormat:
        typeof input.defaultTeamFormat === "string" ? input.defaultTeamFormat : undefined,
      autoBalance: typeof input.autoBalance === "boolean" ? input.autoBalance : undefined,
      crossGuildMatchmaking:
        typeof input.crossGuildMatchmaking === "boolean" ? input.crossGuildMatchmaking : undefined,
    };
  })
  .handler(async ({ data }) => {
    return upsertGuildSettings(getRequestHeaders(), data.guildId, {
      dailyMatchLimit: data.dailyMatchLimit,
      defaultTeamFormat: data.defaultTeamFormat,
      autoBalance: data.autoBalance,
      crossGuildMatchmaking: data.crossGuildMatchmaking,
    });
  });

export const Route = createFileRoute("/guild/$guildId/settings")({
  loader: ({ params }) => loadGuildSettings({ data: { guildId: params.guildId } }),
  component: GuildSettingsRoute,
});

function GuildSettingsRoute() {
  const { guildId } = Route.useParams();
  const data = Route.useLoaderData();

  const [dailyMatchLimit, setDailyMatchLimit] = useState<number | "">(data?.dailyMatchLimit ?? "");
  const [defaultTeamFormat, setDefaultTeamFormat] = useState(data?.defaultTeamFormat ?? "5v5");
  const [autoBalance, setAutoBalance] = useState(data?.autoBalance ?? true);
  const [crossGuildMatchmaking, setCrossGuildMatchmaking] = useState(
    data?.crossGuildMatchmaking ?? true,
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
      const result = await saveGuildSettings({
        data: {
          guildId,
          dailyMatchLimit: typeof dailyMatchLimit === "number" ? dailyMatchLimit : undefined,
          defaultTeamFormat,
          autoBalance,
          crossGuildMatchmaking,
        },
      });
      if (result) {
        showToast("success", "Settings saved successfully.");
      } else {
        showToast("error", "Failed to save settings.");
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
        <h1 className="hq-title">Settings</h1>
        <p className="hq-subtitle">Guild configuration and preferences.</p>

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
              <CardTitle>Match Settings</CardTitle>
              <CardDescription>Configure match limits and team formats.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6">
              <div className="grid gap-2">
                <label className="filter-label">Daily Match Limit</label>
                <input
                  type="number"
                  min={0}
                  value={dailyMatchLimit}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDailyMatchLimit(val === "" ? "" : Number(val));
                  }}
                  className="flex h-9 w-full rounded-md border border-white/12 bg-white/4 px-3 py-2 text-sm text-white shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-white/30 focus-visible:ring-[3px] focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50"
                  placeholder="Enter daily match limit"
                />
              </div>

              <div className="grid gap-2">
                <label className="filter-label">Default Team Format</label>
                <Select value={defaultTeamFormat} onValueChange={setDefaultTeamFormat}>
                  <SelectTrigger className="hq-select w-full">
                    <SelectValue placeholder="Select format" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5v5">5v5</SelectItem>
                    <SelectItem value="4v4">4v4</SelectItem>
                    <SelectItem value="3v3">3v3</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Game Preferences</CardTitle>
              <CardDescription>Toggle automated matchmaking features.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <label className="flex cursor-pointer items-center justify-between rounded-md border border-white/8 bg-white/4 px-4 py-3 transition-colors hover:bg-white/6">
                <span className="text-sm">Auto-balance teams</span>
                <input
                  type="checkbox"
                  checked={autoBalance}
                  onChange={(e) => setAutoBalance(e.target.checked)}
                  className="size-4 accent-white"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-md border border-white/8 bg-white/4 px-4 py-3 transition-colors hover:bg-white/6">
                <span className="text-sm">Cross-guild matchmaking</span>
                <input
                  type="checkbox"
                  checked={crossGuildMatchmaking}
                  onChange={(e) => setCrossGuildMatchmaking(e.target.checked)}
                  className="size-4 accent-white"
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
