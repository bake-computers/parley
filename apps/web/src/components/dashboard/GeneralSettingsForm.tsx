import { useCallback, useMemo, useState } from "react";
import { GlassPanel } from "#/components/ui/glass-panel";
import type { GuildSettingsJson } from "#/lib/dashboard/guild/types";
import { settingsBaselineKey } from "#/lib/shared/settings-baseline";
import { suggestTeamFormats, validateTeamFormat } from "#/lib/dashboard/guild/validation";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { useGuildDashboard } from "./GuildDashboardContext";
import { AutocompleteInput } from "./AutocompleteInput";
import { SettingsField, SettingsToggle } from "./SettingsField";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsToast } from "./SettingsToast";

export function GeneralSettingsForm() {
  const { guildId, settings, patchSettings } = useGuildDashboard();
  const [toast, setToast] = useState<string | null>(null);

  const validate = useCallback(
    (draft: GuildSettingsJson) => validateTeamFormat(draft.defaultTeamFormat),
    [],
  );

  const generalKey = settingsBaselineKey(settings.general);
  const initial = useMemo(
    () => ({
      ...settings.general,
      defaultTeamFormat: settings.general.defaultTeamFormat || "5v5",
      matchmakingEnabled: settings.general.matchmakingEnabled ?? false,
      autoBalance: settings.general.autoBalance ?? false,
      crossGuildMatchmaking: settings.general.crossGuildMatchmaking ?? false,
    }),
    [generalKey],
  );

  const section = useSettingsSection({
    guildId,
    section: "general",
    initial,
    validate,
    onSaved: (next) => patchSettings({ general: next }),
  });

  const formatSuggestions = suggestTeamFormats(section.draft.defaultTeamFormat);
  const formatError = validateTeamFormat(section.draft.defaultTeamFormat);

  return (
    <>
      <GlassPanel as="section" className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">General</h2>
          <p className="text-muted-foreground text-sm">
            Core matchmaking behavior for this server.
          </p>
        </div>
        <SettingsField
          label="Default team format"
          error={section.isDirty ? formatError : null}
          hint="e.g. 5v5"
        >
          <AutocompleteInput
            value={section.draft.defaultTeamFormat}
            onChange={(v) => section.setDraft((g) => ({ ...g, defaultTeamFormat: v }))}
            options={formatSuggestions}
            invalid={Boolean(formatError)}
          />
        </SettingsField>
        <SettingsToggle
          label="Matchmaking enabled"
          description="Allow Parley queues in this guild."
          checked={section.draft.matchmakingEnabled}
          onChange={(v) => section.setDraft((g) => ({ ...g, matchmakingEnabled: v }))}
        />
        <SettingsToggle
          label="Auto balance teams"
          checked={section.draft.autoBalance}
          onChange={(v) => section.setDraft((g) => ({ ...g, autoBalance: v }))}
        />
        <SettingsToggle
          label="Cross-guild matchmaking"
          checked={section.draft.crossGuildMatchmaking}
          onChange={(v) => section.setDraft((g) => ({ ...g, crossGuildMatchmaking: v }))}
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
