import { useCallback, useMemo, useState } from "react";
import { GlassPanel } from "#/components/ui/glass-panel";
import type { GuildMatchQuotaJson } from "#/lib/guild-settings-types";
import { settingsBaselineKey } from "#/lib/settings-baseline";
import { validateDailyMatchLimit } from "#/lib/guild-settings-validation";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { cn } from "#/lib/utils";
import { useGuildDashboard } from "./GuildDashboardContext";
import { SettingsField, SettingsInput } from "./SettingsField";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsToast } from "./SettingsToast";

export function QuotaSettingsForm() {
  const { guildId, settings, patchSettings } = useGuildDashboard();
  const [toast, setToast] = useState<string | null>(null);

  const validate = useCallback(
    (draft: GuildMatchQuotaJson) => validateDailyMatchLimit(draft.dailyMatchLimit),
    [],
  );

  const quotaKey = settingsBaselineKey(settings.matchQuota);
  const initial = useMemo(() => ({ ...settings.matchQuota }), [quotaKey]);

  const section = useSettingsSection({
    guildId,
    section: "matchQuota",
    initial,
    validate,
    onSaved: (next) => patchSettings({ matchQuota: next }),
  });

  const limitError = validateDailyMatchLimit(section.draft.dailyMatchLimit);

  return (
    <>
      <GlassPanel as="section" className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Match quota</h2>
          <p className="text-muted-foreground text-sm">Daily match limit for this guild (0 = unlimited).</p>
        </div>
        <SettingsField
          label="Daily match limit"
          error={section.isDirty ? limitError : null}
        >
          <SettingsInput
            type="number"
            min={0}
            step={1}
            className={cn("max-w-xs")}
            value={section.draft.dailyMatchLimit}
            onChange={(e) =>
              section.setDraft((q) => ({ ...q, dailyMatchLimit: Number(e.target.value) }))
            }
          />
        </SettingsField>
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