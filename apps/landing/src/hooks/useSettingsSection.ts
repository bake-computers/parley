import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SettingsSection } from "#/lib/dashboard/api-types";

function stableEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type GuildPersist = {
  mode: "guild";
  guildId: string;
  section: SettingsSection;
};

type UserPersist = {
  mode: "user";
};

type Persist = GuildPersist | UserPersist;

export function useSettingsSection<T>({
  guildId,
  section,
  initial,
  validate,
  onSaved,
  persist,
}: {
  guildId?: string;
  section?: SettingsSection;
  initial: T;
  validate: (draft: T) => string | null;
  onSaved?: (next: T) => void;
  persist?: Persist;
}) {
  const target: Persist =
    persist ?? { mode: "guild", guildId: guildId!, section: section! };

  const baselineKey = JSON.stringify(initial);
  const appliedBaselineKey = useRef(baselineKey);

  const [saved, setSaved] = useState(() => structuredClone(initial));
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (appliedBaselineKey.current === baselineKey) {
      return;
    }
    appliedBaselineKey.current = baselineKey;
    const baseline = structuredClone(JSON.parse(baselineKey) as T);
    setSaved(baseline);
    setDraft(baseline);
    setError(null);
  }, [baselineKey]);

  const isDirty = useMemo(() => !stableEqual(draft, saved), [draft, saved]);
  const validationError = useMemo(() => validate(draft), [draft, validate]);
  const canSave = isDirty && !validationError && !saving;

  const reset = useCallback(() => {
    setDraft(structuredClone(saved));
    setError(null);
  }, [saved]);

  const commitSaved = useCallback(
    (snapshot: T) => {
      const key = JSON.stringify(snapshot);
      appliedBaselineKey.current = key;
      setSaved(structuredClone(snapshot));
      setDraft(structuredClone(snapshot));
      onSaved?.(snapshot);
    },
    [onSaved],
  );

  const save = useCallback(
    async (override?: T) => {
      const payload = override ?? draft;
      const v = validate(payload);
      if (v) {
        setError(v);
        return false;
      }
      setSaving(true);
      setError(null);
      try {
        const url =
          target.mode === "user"
            ? "/api/dashboard/user/settings"
            : `/api/dashboard/guilds/${target.guildId}/settings`;
        const body =
          target.mode === "user"
            ? { settings: payload }
            : { section: target.section, payload };
        const responseKey = target.mode === "user" ? "settings" : target.section;

        const res = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Save failed");
          return false;
        }
        const next = data[responseKey] as T | undefined;
        commitSaved(structuredClone(next ?? payload));
        return true;
      } catch {
        setError("Network error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [commitSaved, draft, target, validate],
  );

  return {
    draft,
    setDraft,
    saved,
    isDirty,
    canSave,
    validationError,
    error,
    saving,
    reset,
    save,
  };
}