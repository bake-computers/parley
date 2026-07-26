import { useCallback, useEffect, useMemo, useState } from "react";
import { GlassPanel } from "#/components/ui/glass-panel";
import type { GuildMatchmakingRulesJson } from "#/lib/dashboard/guild/types";
import {
  PLATFORM_OPTIONS,
  parsePlatformsInput,
  validateEloRange,
  validateMaxEloGap,
  validatePlatforms,
} from "#/lib/dashboard/guild/validation";
import { settingsBaselineKey } from "#/lib/shared/settings-baseline";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { useGuildDashboard } from "./GuildDashboardContext";
import { AutocompleteInput } from "./AutocompleteInput";
import { SettingsField, SettingsInput, SettingsToggle } from "./SettingsField";
import { SettingsSaveBar } from "./SettingsSaveBar";
import { SettingsToast } from "./SettingsToast";

function validateRules(draft: GuildMatchmakingRulesJson): string | null {
  return (
    validateEloRange(draft.minElo, draft.maxElo) ??
    validateMaxEloGap(draft.maxEloGap) ??
    validatePlatforms(draft.platforms ?? [])
  );
}

export function RulesSettingsForm() {
  const { guildId, settings, patchSettings } = useGuildDashboard();
  const [toast, setToast] = useState<string | null>(null);
  const rulesKey = settingsBaselineKey(settings.matchmakingRules);

  const initial = useMemo(
    () => ({
      ...settings.matchmakingRules,
      platforms: settings.matchmakingRules.platforms ?? [],
    }),
    [rulesKey],
  );

  const platformsFromServer = useMemo(
    () => (settings.matchmakingRules.platforms ?? []).join(", "),
    [rulesKey],
  );

  const [platformsText, setPlatformsText] = useState(platformsFromServer);

  useEffect(() => {
    setPlatformsText(platformsFromServer);
  }, [platformsFromServer]);

  const validate = useCallback((draft: GuildMatchmakingRulesJson) => validateRules(draft), []);

  const onSaved = useCallback(
    (next: GuildMatchmakingRulesJson) => {
      const normalized = { ...next, platforms: next.platforms ?? [] };
      setPlatformsText(normalized.platforms.join(", "));
      patchSettings({ matchmakingRules: normalized });
    },
    [patchSettings],
  );

  const section = useSettingsSection({
    guildId,
    section: "matchmakingRules",
    initial,
    validate,
    onSaved,
  });

  const platformsError = validatePlatforms(parsePlatformsInput(platformsText));
  const combinedError = section.validationError ?? platformsError;

  const handleSave = async () => {
    const platforms = parsePlatformsInput(platformsText);
    const platformErr = validatePlatforms(platforms);
    if (platformErr) {
      return;
    }
    if (await section.save({ ...section.draft, platforms })) {
      setToast("Settings saved");
    }
  };

  const syncPlatforms = (raw: string) => {
    setPlatformsText(raw);
    section.setDraft((r) => ({ ...r, platforms: parsePlatformsInput(raw) }));
  };

  return (
    <>
      <GlassPanel as="section" className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Matchmaking rules</h2>
          <p className="text-muted-foreground text-sm">
            Elo gates and platform filters. 0 = unset.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <SettingsField
            label="Min Elo"
            error={
              section.isDirty ? validateEloRange(section.draft.minElo, section.draft.maxElo) : null
            }
          >
            <SettingsInput
              type="number"
              min={0}
              value={section.draft.minElo}
              onChange={(e) => section.setDraft((r) => ({ ...r, minElo: Number(e.target.value) }))}
            />
          </SettingsField>
          <SettingsField label="Max Elo">
            <SettingsInput
              type="number"
              min={0}
              value={section.draft.maxElo}
              onChange={(e) => section.setDraft((r) => ({ ...r, maxElo: Number(e.target.value) }))}
            />
          </SettingsField>
          <SettingsField
            label="Max Elo gap"
            error={section.isDirty ? validateMaxEloGap(section.draft.maxEloGap) : null}
          >
            <SettingsInput
              type="number"
              min={0}
              value={section.draft.maxEloGap}
              onChange={(e) =>
                section.setDraft((r) => ({ ...r, maxEloGap: Number(e.target.value) }))
              }
            />
          </SettingsField>
          <SettingsField
            label="Platforms"
            error={section.isDirty ? platformsError : null}
            hint="Comma-separated: pc, xbox, psn"
          >
            <AutocompleteInput
              value={platformsText}
              onChange={syncPlatforms}
              options={PLATFORM_OPTIONS}
              invalid={Boolean(platformsError)}
              placeholder="pc, xbox, psn"
              multi
            />
          </SettingsField>
        </div>
        <SettingsToggle
          label="Require verified accounts"
          checked={section.draft.requireVerified}
          onChange={(v) => section.setDraft((r) => ({ ...r, requireVerified: v }))}
        />
        {section.error ? <p className="text-destructive text-sm">{section.error}</p> : null}
        {combinedError && section.isDirty ? (
          <p className="text-destructive text-sm">{combinedError}</p>
        ) : null}
      </GlassPanel>

      <SettingsSaveBar
        visible={section.isDirty}
        saving={section.saving}
        canSave={section.canSave && !platformsError}
        validationError={combinedError}
        error={section.error}
        onReset={() => {
          const baseline = (section.saved.platforms ?? []).join(", ");
          section.reset();
          setPlatformsText(baseline);
        }}
        onSave={handleSave}
      />
      <SettingsToast message={toast} onDismiss={() => setToast(null)} />
    </>
  );
}
