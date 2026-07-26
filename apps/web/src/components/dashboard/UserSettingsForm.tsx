import { useCallback, useMemo, useState } from "react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { settingsBaselineKey } from "#/lib/shared/settings-baseline";
import type { UserSettingsJson } from "#/lib/dashboard/user/types";
import { SettingsToggle } from "./SettingsField";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsToast } from "./SettingsToast";

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
    }),
    [settingsKey],
  );

  const validate = useCallback(() => null, []);

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
        <SettingsToggle
          label="Matchmaking enabled"
          description="Join Parley matches on servers you play on."
          checked={section.draft.matchmakingEnabled}
          onChange={(v) => section.setDraft((s) => ({ ...s, matchmakingEnabled: v }))}
        />
        <SettingsToggle
          label="Public profile"
          description="Show your stats on your public profile."
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
