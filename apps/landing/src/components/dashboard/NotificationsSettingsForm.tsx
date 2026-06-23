import { useCallback, useMemo, useState } from "react";
import { GlassPanel } from "#/components/ui/glass-panel";
import type { GuildNotificationSettingsJson } from "#/lib/dashboard/guild/types";
import { settingsBaselineKey } from "#/lib/shared/settings-baseline";
import { validateDiscordSnowflake } from "#/lib/dashboard/guild/validation";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { useGuildDashboard } from "./GuildDashboardContext";
import { SettingsField, SettingsInput, SettingsToggle } from "./SettingsField";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsToast } from "./SettingsToast";

function validateNotifications(draft: GuildNotificationSettingsJson): string | null {
  return (
    validateDiscordSnowflake(draft.matchResultsChannel, "Match results channel") ??
    validateDiscordSnowflake(draft.tournamentAnnouncementsChannel, "Tournament channel")
  );
}

export function NotificationsSettingsForm() {
  const { guildId, settings, patchSettings } = useGuildDashboard();
  const [toast, setToast] = useState<string | null>(null);
  const validate = useCallback(
    (draft: GuildNotificationSettingsJson) => validateNotifications(draft),
    [],
  );

  const notificationsKey = settingsBaselineKey(settings.notifications);
  const initial = useMemo(
    () => ({
      ...settings.notifications,
      matchResultsChannel: settings.notifications.matchResultsChannel ?? "",
      tournamentAnnouncementsChannel: settings.notifications.tournamentAnnouncementsChannel ?? "",
      leaderboardUpdatesEnabled: settings.notifications.leaderboardUpdatesEnabled ?? false,
      crossGuildAnnouncementsEnabled: settings.notifications.crossGuildAnnouncementsEnabled ?? false,
      announceMatchReadyEnabled: settings.notifications.announceMatchReadyEnabled ?? true,
      announceMatchResultsEnabled: settings.notifications.announceMatchResultsEnabled ?? true,
    }),
    [notificationsKey],
  );

  const section = useSettingsSection({
    guildId,
    section: "notifications",
    initial,
    validate,
    onSaved: (next) => patchSettings({ notifications: next }),
  });

  return (
    <>
      <GlassPanel as="section" className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Notifications</h2>
          <p className="text-muted-foreground text-sm">
            Discord channel IDs for bot announcements (same as /settings in Discord).
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <SettingsField
            label="Match results channel ID"
            error={
              section.isDirty
                ? validateDiscordSnowflake(section.draft.matchResultsChannel, "Match results channel")
                : null
            }
          >
            <SettingsInput
              value={section.draft.matchResultsChannel}
              onChange={(e) =>
                section.setDraft((n) => ({ ...n, matchResultsChannel: e.target.value }))
              }
              placeholder="Channel snowflake or empty"
            />
          </SettingsField>
          <SettingsField
            label="Tournament announcements channel ID"
            error={
              section.isDirty
                ? validateDiscordSnowflake(
                    section.draft.tournamentAnnouncementsChannel,
                    "Tournament channel",
                  )
                : null
            }
          >
            <SettingsInput
              value={section.draft.tournamentAnnouncementsChannel}
              onChange={(e) =>
                section.setDraft((n) => ({
                  ...n,
                  tournamentAnnouncementsChannel: e.target.value,
                }))
              }
            />
          </SettingsField>
        </div>
        <SettingsToggle
          label="Leaderboard updates"
          checked={section.draft.leaderboardUpdatesEnabled}
          onChange={(v) => section.setDraft((n) => ({ ...n, leaderboardUpdatesEnabled: v }))}
        />
        <SettingsToggle
          label="Cross-guild announcements"
          checked={section.draft.crossGuildAnnouncementsEnabled}
          onChange={(v) =>
            section.setDraft((n) => ({ ...n, crossGuildAnnouncementsEnabled: v }))
          }
        />
        <SettingsToggle
          label="Announce match ready"
          checked={section.draft.announceMatchReadyEnabled}
          onChange={(v) => section.setDraft((n) => ({ ...n, announceMatchReadyEnabled: v }))}
        />
        <SettingsToggle
          label="Announce match results"
          checked={section.draft.announceMatchResultsEnabled}
          onChange={(v) => section.setDraft((n) => ({ ...n, announceMatchResultsEnabled: v }))}
        />
        {section.error ? <p className="text-destructive text-sm">{section.error}</p> : null}
      </GlassPanel>

      <SettingsSaveBar
        visible={section.isDirty}
        saving={section.saving}
        canSave={section.canSave}
        validationError={section.validationError}
        error={section.error}
        onReset={section.reset}
        onSave={async () => {
          if (await section.save()) {
            setToast("Settings saved");
          }
        }}
      />
      <SettingsToast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}