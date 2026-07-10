import { useCallback, useMemo, useState } from "react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { settingsBaselineKey } from "#/lib/shared/settings-baseline";
import type { UserSettingsJson } from "#/lib/dashboard/user/types";
import { SettingsField, SettingsSelect, SettingsToggle } from "./SettingsField";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsToast } from "./SettingsToast";

function validateUserSettings(draft: UserSettingsJson): string | null {
  if (
    !Number.isInteger(draft.matchmakingRegion) ||
    draft.matchmakingRegion < 0 ||
    draft.matchmakingRegion > 4
  ) {
    return "Choose a valid matchmaking region";
  }
  return null;
}

export function UserSettingsForm({
  settings,
  onSaved,
}: {
  settings: UserSettingsJson;
  onSaved: (next: UserSettingsJson) => void;
}) {
  const [toast, setToast] = useState<string | null>(null);
  const settingsKey = settingsBaselineKey(settings);

  const initial = useMemo(
    () => ({
      ...settings,
      matchmakingEnabled: settings.matchmakingEnabled ?? true,
      profilePublic: settings.profilePublic ?? true,
      matchmakingRegion: settings.matchmakingRegion ?? 0,
    }),
    [settingsKey],
  );

  const validate = useCallback((draft: UserSettingsJson) => validateUserSettings(draft), []);

  const section = useSettingsSection({
    initial,
    validate,
    onSaved,
    persist: { mode: "user" },
  });

  const handleSave = async () => {
    const ok = await section.save();
    if (ok) {
      setToast("Settings saved");
    }
  };

  return (
    <>
      <GlassPanel as="section" className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Your settings</h2>
          <p className="text-muted-foreground text-sm">
            Personal preferences across all Parley servers.
          </p>
        </div>
        <SettingsField
          label="Matchmaking region"
          hint="Applies to new queue entries. Global can fill one regional lobby without mixing regions."
        >
          <SettingsSelect
            value={section.draft.matchmakingRegion}
            onChange={(e) =>
              section.setDraft((s) => ({ ...s, matchmakingRegion: Number(e.target.value) }))
            }
          >
            <option value={0}>Global (no preference)</option>
            <option value={1}>Europe</option>
            <option value={2}>North America</option>
            <option value={3}>Asia-Pacific</option>
            <option value={4}>South America</option>
          </SettingsSelect>
        </SettingsField>
        <SettingsToggle
          label="Matchmaking enabled"
          description="Join Parley queues on servers you play on."
          checked={section.draft.matchmakingEnabled}
          onChange={(v) => section.setDraft((s) => ({ ...s, matchmakingEnabled: v }))}
        />
        <SettingsToggle
          label="Public profile"
          description="Show your stats on public leaderboards."
          checked={section.draft.profilePublic}
          onChange={(v) => section.setDraft((s) => ({ ...s, profilePublic: v }))}
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
        onSave={handleSave}
      />
      <SettingsToast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
