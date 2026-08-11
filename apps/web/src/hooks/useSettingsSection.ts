import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SettingsSection } from "#/lib/dashboard/api-types";

export type SettingsSaveStatus = "idle" | "saving" | "saved" | "error";

const AUTOSAVE_DEBOUNCE_MS = 500;
const SAVED_STATUS_MS = 2000;

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

export function useSettingsSection<T extends object>({
  guildId,
  section,
  initial,
  validate,
  onSaved,
  persist,
  autosave = true,
}: {
  guildId?: string;
  section?: SettingsSection;
  initial: T;
  validate: (draft: T) => string | null;
  onSaved?: (next: T) => void;
  persist?: Persist;
  autosave?: boolean;
}) {
  const target: Persist = persist ?? { mode: "guild", guildId: guildId!, section: section! };

  const baselineKey = JSON.stringify(initial);
  const appliedBaselineKey = useRef(baselineKey);

  const [saved, setSaved] = useState(() => structuredClone(initial));
  const [draft, setDraft] = useState(() => structuredClone(initial));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<SettingsSaveStatus>("idle");

  const draftRef = useRef(draft);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSeqRef = useRef(0);

  useEffect(() => {
    if (appliedBaselineKey.current === baselineKey) {
      return;
    }
    appliedBaselineKey.current = baselineKey;
    // Cancel any pending debounced save so a stale payload cannot fire after the reset.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const baseline = structuredClone(JSON.parse(baselineKey) as T);
    draftRef.current = baseline;
    setSaved(baseline);
    setDraft(baseline);
    setError(null);
    setStatus("idle");
  }, [baselineKey]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (statusTimerRef.current) {
        clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  const isDirty = useMemo(() => !stableEqual(draft, saved), [draft, saved]);
  const validationError = useMemo(() => validate(draft), [draft, validate]);
  const canSave = isDirty && !validationError && !saving;

  const reset = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const baseline = structuredClone(saved);
    draftRef.current = baseline;
    setDraft(baseline);
    setError(null);
    setStatus("idle");
  }, [saved]);

  const commitSaved = useCallback(
    (snapshot: T, replaceDraft: boolean) => {
      const key = JSON.stringify(snapshot);
      appliedBaselineKey.current = key;
      setSaved(structuredClone(snapshot));
      if (replaceDraft) {
        draftRef.current = snapshot;
        setDraft(structuredClone(snapshot));
      }
      onSaved?.(snapshot);
    },
    [onSaved],
  );

  const runSave = useCallback(
    async (payload: T): Promise<boolean> => {
      const v = validate(payload);
      if (v) {
        setError(v);
        setStatus("error");
        return false;
      }
      const seq = ++saveSeqRef.current;
      setSaving(true);
      setStatus("saving");
      setError(null);
      try {
        const url =
          target.mode === "user"
            ? "/api/dashboard/user/settings"
            : `/api/dashboard/guilds/${target.guildId}/settings`;
        const body =
          target.mode === "user" ? { settings: payload } : { section: target.section, payload };
        const responseKey = target.mode === "user" ? "settings" : target.section;

        const res = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) {
          if (seq === saveSeqRef.current) {
            setError(data.error ?? "Save failed");
            setStatus("error");
          }
          return false;
        }
        if (seq !== saveSeqRef.current) {
          return false;
        }
        const next = data[responseKey] as T | undefined;
        commitSaved(structuredClone(next ?? payload), false);
        setStatus("saved");
        if (statusTimerRef.current) {
          clearTimeout(statusTimerRef.current);
        }
        statusTimerRef.current = setTimeout(() => {
          setStatus((s) => (s === "saved" ? "idle" : s));
        }, SAVED_STATUS_MS);
        return true;
      } catch {
        if (seq === saveSeqRef.current) {
          setError("Network error");
          setStatus("error");
        }
        return false;
      } finally {
        if (seq === saveSeqRef.current) {
          setSaving(false);
        }
      }
    },
    [commitSaved, target, validate],
  );

  const scheduleSave = useCallback(
    (payload: T) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        debounceRef.current = null;
        void runSave(payload);
      }, AUTOSAVE_DEBOUNCE_MS);
    },
    [runSave],
  );

  /** Update draft fields and debounce a save (no-op scheduling when autosave off). */
  const updateField = useCallback(
    (update: Partial<T> | ((prev: T) => T)) => {
      const prev = draftRef.current;
      const next =
        typeof update === "function" ? (update as (prev: T) => T)(prev) : { ...prev, ...update };
      draftRef.current = next;
      setDraft(next);
      if (autosave) {
        scheduleSave(next);
      }
    },
    [autosave, scheduleSave],
  );

  /** Flip a boolean field and save immediately, cancelling any pending debounce. */
  const setToggle = useCallback(
    (key: keyof T, value: boolean) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      const prev = draftRef.current;
      const next = { ...prev, [key]: value };
      draftRef.current = next;
      setDraft(next);
      if (autosave) {
        void runSave(next).then((ok) => {
          // On failure, roll the toggle back to the last saved value so the draft
          // doesn't silently diverge. Skip if a newer update already changed it.
          if (!ok && draftRef.current[key] === next[key]) {
            const rollback = { ...draftRef.current, [key]: saved[key] };
            draftRef.current = rollback;
            setDraft(rollback);
          }
        });
      }
    },
    [autosave, runSave, saved],
  );

  const save = useCallback(
    async (override?: T) => {
      const payload = override ?? draftRef.current;
      const v = validate(payload);
      if (v) {
        setError(v);
        setStatus("error");
        return false;
      }
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      // Manual saves reset the draft to the server-confirmed payload.
      const url =
        target.mode === "user"
          ? "/api/dashboard/user/settings"
          : `/api/dashboard/guilds/${target.guildId}/settings`;
      const body =
        target.mode === "user" ? { settings: payload } : { section: target.section, payload };
      const responseKey = target.mode === "user" ? "settings" : target.section;

      setSaving(true);
      setStatus("saving");
      setError(null);
      try {
        const res = await fetch(url, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Save failed");
          setStatus("error");
          return false;
        }
        const next = data[responseKey] as T | undefined;
        commitSaved(structuredClone(next ?? payload), true);
        setStatus("saved");
        return true;
      } catch {
        setError("Network error");
        setStatus("error");
        return false;
      } finally {
        setSaving(false);
      }
    },
    [commitSaved, target, validate],
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
    status,
    reset,
    updateField,
    setToggle,
    save,
  };
}
