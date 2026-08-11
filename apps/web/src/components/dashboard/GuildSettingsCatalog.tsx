import { useEffect, useMemo, useState } from "react";
import { GlassPanel } from "#/components/ui/glass-panel";
import { useScrollSpy } from "#/hooks/useScrollSpy";
import type { SettingsSection } from "#/lib/dashboard/api-types";
import type {
  GuildMatchmakingRulesJson,
  GuildMatchQuotaJson,
  GuildSettingsJson,
} from "#/lib/dashboard/guild/types";
import {
  PLATFORM_OPTIONS,
  parsePlatformsInput,
  suggestTeamFormats,
  validateDailyMatchLimit,
  validateEloRange,
  validateMaxEloGap,
  validatePlatforms,
  validateTeamFormat,
} from "#/lib/dashboard/guild/validation";
import { settingsBaselineKey } from "#/lib/shared/settings-baseline";
import { useSettingsSection } from "#/hooks/useSettingsSection";
import { cn } from "#/lib/shared/cn";
import { AutocompleteInput } from "./AutocompleteInput";
import { SaveStatus } from "./SaveStatus";
import { SettingsField, SettingsInput, SettingsToggle } from "./SettingsField";
import { SettingsSearch } from "./SettingsSearch";
import { useGuildDashboard } from "./GuildDashboardContext";

const SECTIONS: { id: SettingsSection; label: string; description: string }[] = [
  {
    id: "general",
    label: "General",
    description: "Core matchmaking behavior for this server.",
  },
  {
    id: "matchmakingRules",
    label: "Matchmaking rules",
    description: "Elo gates and platform filters. 0 = unset.",
  },
  {
    id: "matchQuota",
    label: "Match quota",
    description: "Daily match limit for this server (0 = unlimited).",
  },
];

type EntryMeta = { label: string; description: string; keywords: readonly string[] };

const GENERAL_META: Record<string, EntryMeta> = {
  defaultTeamFormat: {
    label: "Default team format",
    description: "Team size used when creating matches, e.g. 5v5.",
    keywords: ["format", "team", "size", "5v5"],
  },
  matchmakingEnabled: {
    label: "Matchmaking enabled",
    description: "Allow Parley queues in this server.",
    keywords: ["queue", "enable", "on", "matchmaking"],
  },
  autoBalance: {
    label: "Auto balance teams",
    description: "Rebalance teams by rank automatically after each match.",
    keywords: ["balance", "teams", "rank", "auto"],
  },
  crossGuildMatchmaking: {
    label: "Cross-guild matchmaking",
    description: "Let players match against other Parley servers.",
    keywords: ["cross", "global", "other servers", "queue"],
  },
};

const RULES_META: Record<string, EntryMeta> = {
  minElo: {
    label: "Min Elo",
    description: "Lowest Elo allowed to queue. 0 = unset.",
    keywords: ["min", "minimum", "rank", "gate"],
  },
  maxElo: {
    label: "Max Elo",
    description: "Highest Elo allowed to queue. 0 = unset.",
    keywords: ["max", "maximum", "rank", "gate", "cap"],
  },
  maxEloGap: {
    label: "Max Elo gap",
    description: "Largest Elo difference allowed between teams in one match. 0 = unlimited.",
    keywords: ["gap", "difference", "spread", "balance"],
  },
  platforms: {
    label: "Platforms",
    description: "Which platforms can queue. Comma-separated: pc, xbox, psn.",
    keywords: ["platform", "pc", "xbox", "psn", "console"],
  },
  requireVerified: {
    label: "Require verified accounts",
    description: "Only players with a verified Ubisoft/R6 account can queue.",
    keywords: ["verified", "ubisoft", "account", "smurf"],
  },
};

const QUOTA_META: Record<string, EntryMeta> = {
  dailyMatchLimit: {
    label: "Daily match limit",
    description: "Matches each player can join per day. 0 = unlimited.",
    keywords: ["daily", "limit", "quota", "cap", "matches"],
  },
};

function matchesQuery(query: string, meta: EntryMeta): boolean {
  const haystack = `${meta.label} ${meta.description} ${meta.keywords.join(" ")}`.toLowerCase();
  return haystack.includes(query);
}

/** Number input that only commits valid values, so clearing the field never PATCHes 0. */
function NumberField({
  value,
  onCommit,
  validate,
}: {
  value: number;
  onCommit: (n: number) => void;
  validate: (n: number) => string | null;
}) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(String(value));
    }
  }, [value, focused]);

  const parsed = text.trim() === "" ? Number.NaN : Number(text);
  const error = Number.isNaN(parsed) ? "Must be a number" : validate(parsed);

  return (
    <>
      <SettingsInput
        type="number"
        min={0}
        value={text}
        invalid={Boolean(error)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setText(String(value));
        }}
        onChange={(e) => {
          setText(e.target.value);
          const next = e.target.value.trim() === "" ? Number.NaN : Number(e.target.value);
          if (Number.isFinite(next)) {
            onCommit(next);
          }
        }}
      />
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
    </>
  );
}

export function GuildSettingsCatalog({ initialSection }: { initialSection?: string }) {
  const { guildId, settings, patchSettings } = useGuildDashboard();
  const [query, setQuery] = useState("");

  const general = useSettingsSection<GuildSettingsJson>({
    guildId,
    section: "general",
    initial: useMemo(
      () => ({
        ...settings.general,
        defaultTeamFormat: settings.general.defaultTeamFormat || "5v5",
        matchmakingEnabled: settings.general.matchmakingEnabled ?? false,
        autoBalance: settings.general.autoBalance ?? false,
        crossGuildMatchmaking: settings.general.crossGuildMatchmaking ?? false,
      }),
      [settingsBaselineKey(settings.general)],
    ),
    validate: (draft) => validateTeamFormat(draft.defaultTeamFormat),
    onSaved: (next) => patchSettings({ general: next }),
  });

  const rules = useSettingsSection<GuildMatchmakingRulesJson>({
    guildId,
    section: "matchmakingRules",
    initial: useMemo(
      () => ({
        ...settings.matchmakingRules,
        platforms: settings.matchmakingRules.platforms ?? [],
      }),
      [settingsBaselineKey(settings.matchmakingRules)],
    ),
    validate: (draft) =>
      validateEloRange(draft.minElo, draft.maxElo) ??
      validateMaxEloGap(draft.maxEloGap) ??
      validatePlatforms(draft.platforms ?? []),
    onSaved: (next) =>
      patchSettings({ matchmakingRules: { ...next, platforms: next.platforms ?? [] } }),
  });

  const quota = useSettingsSection<GuildMatchQuotaJson>({
    guildId,
    section: "matchQuota",
    initial: useMemo(() => ({ ...settings.matchQuota }), [settingsBaselineKey(settings.matchQuota)]),
    validate: (draft) => validateDailyMatchLimit(draft.dailyMatchLimit),
    onSaved: (next) => patchSettings({ matchQuota: next }),
  });

  const sectionIds = useMemo(() => SECTIONS.map((s) => s.id), []);
  const { activeId } = useScrollSpy({ sectionIds });

  // Legacy short ids from old bookmarks map to their canonical section ids.
  const LEGACY_SECTION_IDS: Record<string, SettingsSection> = {
    rules: "matchmakingRules",
    quota: "matchQuota",
  };
  const canonicalSectionId = (id: string) => LEGACY_SECTION_IDS[id] ?? id;

  useEffect(() => {
    if (!initialSection) {
      return;
    }
    const el = document.getElementById(canonicalSectionId(initialSection));
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initialSection]);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  const filtered = useMemo(() => {
    if (!searching) {
      return null;
    }
    return {
      general: Object.entries(GENERAL_META).filter(([, meta]) => matchesQuery(q, meta)),
      matchmakingRules: Object.entries(RULES_META).filter(([, meta]) => matchesQuery(q, meta)),
      matchQuota: Object.entries(QUOTA_META).filter(([, meta]) => matchesQuery(q, meta)),
    };
  }, [q, searching]);

  const resultCount = filtered
    ? filtered.general.length + filtered.matchmakingRules.length + filtered.matchQuota.length
    : 0;

  const scrollTo = (section: string) => {
    document.getElementById(canonicalSectionId(section))?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const g = general.draft;
  const r = rules.draft;
  const qq = quota.draft;

  const formatError = validateTeamFormat(g.defaultTeamFormat);
  const platformsError = validatePlatforms(r.platforms ?? []);

  return (
    <div className="space-y-6">
      <div className="sticky top-0 z-10 -mx-4 bg-background/95 px-4 py-3 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <SettingsSearch value={query} onChange={setQuery} />
        {!searching ? (
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 lg:hidden" role="tablist" aria-label="Settings sections">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => scrollTo(s.id)}
                className={cn(
                  "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                  activeId === s.id
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {searching && resultCount === 0 ? (
        <GlassPanel className="p-8 text-center">
          <p className="text-muted-foreground text-sm">
            No settings match “{query.trim()}”.
          </p>
        </GlassPanel>
      ) : null}

      {SECTIONS.map((s) => {
        const sectionHook =
          s.id === "general" ? general : s.id === "matchmakingRules" ? rules : quota;
        if (filtered !== null && filtered[s.id].length === 0) {
          return null;
        }
        const visible =
          filtered === null ? null : new Set(filtered[s.id].map(([key]) => key));
        const showField = (key: string) => visible === null || visible.has(key);

        return (
          <GlassPanel
            key={s.id}
            as="section"
            id={s.id}
            className="scroll-mt-24 flex flex-col gap-4 p-6"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">{s.label}</h2>
                <p className="text-muted-foreground text-sm">{s.description}</p>
              </div>
              <SaveStatus status={sectionHook.status} />
            </div>

            {s.id === "general" ? (
              [
                showField("defaultTeamFormat") ? (
                  <SettingsField
                    label={GENERAL_META.defaultTeamFormat.label}
                    error={formatError}
                    hint={GENERAL_META.defaultTeamFormat.description}
                  >
                    <AutocompleteInput
                      value={g.defaultTeamFormat}
                      onChange={(v) => general.updateField({ defaultTeamFormat: v })}
                      options={suggestTeamFormats(g.defaultTeamFormat)}
                      invalid={Boolean(formatError)}
                    />
                  </SettingsField>
                ) : null,
                showField("matchmakingEnabled") ? (
                  <SettingsToggle
                    label={GENERAL_META.matchmakingEnabled.label}
                    description={GENERAL_META.matchmakingEnabled.description}
                    checked={g.matchmakingEnabled}
                    onChange={(v) => general.setToggle("matchmakingEnabled", v)}
                  />
                ) : null,
                showField("autoBalance") ? (
                  <SettingsToggle
                    label={GENERAL_META.autoBalance.label}
                    description={GENERAL_META.autoBalance.description}
                    checked={g.autoBalance}
                    onChange={(v) => general.setToggle("autoBalance", v)}
                  />
                ) : null,
                showField("crossGuildMatchmaking") ? (
                  <SettingsToggle
                    label={GENERAL_META.crossGuildMatchmaking.label}
                    description={GENERAL_META.crossGuildMatchmaking.description}
                    checked={g.crossGuildMatchmaking}
                    onChange={(v) => general.setToggle("crossGuildMatchmaking", v)}
                  />
                ) : null,
              ]
            ) : s.id === "matchmakingRules" ? (
              [
                showField("minElo") ? (
                  <SettingsField label={RULES_META.minElo.label} hint={RULES_META.minElo.description}>
                    <NumberField
                      value={r.minElo}
                      onCommit={(n) => rules.updateField({ minElo: n })}
                      validate={(n) => validateEloRange(n, r.maxElo)}
                    />
                  </SettingsField>
                ) : null,
                showField("maxElo") ? (
                  <SettingsField label={RULES_META.maxElo.label} hint={RULES_META.maxElo.description}>
                    <NumberField
                      value={r.maxElo}
                      onCommit={(n) => rules.updateField({ maxElo: n })}
                      validate={(n) => validateEloRange(r.minElo, n)}
                    />
                  </SettingsField>
                ) : null,
                showField("maxEloGap") ? (
                  <SettingsField label={RULES_META.maxEloGap.label} hint={RULES_META.maxEloGap.description}>
                    <NumberField
                      value={r.maxEloGap}
                      onCommit={(n) => rules.updateField({ maxEloGap: n })}
                      validate={validateMaxEloGap}
                    />
                  </SettingsField>
                ) : null,
                showField("platforms") ? (
                  <SettingsField
                    label={RULES_META.platforms.label}
                    error={platformsError}
                    hint={RULES_META.platforms.description}
                  >
                    <AutocompleteInput
                      value={(r.platforms ?? []).join(", ")}
                      onChange={(v) => rules.updateField({ platforms: parsePlatformsInput(v) })}
                      options={PLATFORM_OPTIONS}
                      invalid={Boolean(platformsError)}
                      placeholder="pc, xbox, psn"
                      multi
                    />
                  </SettingsField>
                ) : null,
                showField("requireVerified") ? (
                  <SettingsToggle
                    label={RULES_META.requireVerified.label}
                    description={RULES_META.requireVerified.description}
                    checked={r.requireVerified}
                    onChange={(v) => rules.setToggle("requireVerified", v)}
                  />
                ) : null,
              ]
            ) : showField("dailyMatchLimit") ? (
              <SettingsField
                label={QUOTA_META.dailyMatchLimit.label}
                hint={QUOTA_META.dailyMatchLimit.description}
              >
                <NumberField
                  value={qq.dailyMatchLimit}
                  onCommit={(n) => quota.updateField({ dailyMatchLimit: n })}
                  validate={validateDailyMatchLimit}
                />
              </SettingsField>
            ) : null}

            {sectionHook.error ? (
              <p className="text-destructive text-sm">{sectionHook.error}</p>
            ) : null}
          </GlassPanel>
        );
      })}

      {searching ? (
        <p className="text-muted-foreground px-1 text-xs">
          {resultCount} result{resultCount === 1 ? "" : "s"} for “{query.trim()}”
        </p>
      ) : null}
    </div>
  );
}
