import { useState, useCallback } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getGuildMatchRules, upsertGuildMatchRules } from "#/lib/server/guild-settings";
import { AuthGuard } from "#/components/auth-guard";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "#/components/ui/card";
import { CheckCircle2, AlertCircle, Save } from "lucide-react";

const PLATFORM_OPTIONS = [
  { value: "PC", label: "PC" },
  { value: "Xbox", label: "Xbox" },
  { value: "PlayStation", label: "PlayStation" },
] as const;

type PlatformValue = (typeof PLATFORM_OPTIONS)[number]["value"];

interface MatchRulesForm {
  minElo: string;
  maxElo: string;
  platforms: PlatformValue[];
  requireVerified: boolean;
  maxEloGap: string;
}

function rulesToForm(
  rules: {
    minElo: number | null;
    maxElo: number | null;
    platforms: string[] | null;
    requireVerified: boolean;
    maxEloGap: number;
  } | null,
): MatchRulesForm {
  const platforms = rules?.platforms ?? [];
  return {
    minElo: rules?.minElo?.toString() ?? "",
    maxElo: rules?.maxElo?.toString() ?? "",
    platforms: platforms.filter((p: string): p is PlatformValue =>
      PLATFORM_OPTIONS.some((opt) => opt.value === p),
    ),
    requireVerified: rules?.requireVerified ?? false,
    maxEloGap: rules?.maxEloGap?.toString() ?? "500",
  };
}

interface ValidationError {
  field: string;
  message: string;
}

function validateForm(form: MatchRulesForm): ValidationError[] {
  const errors: ValidationError[] = [];

  const minEloNum = form.minElo === "" ? null : Number(form.minElo);
  const maxEloNum = form.maxElo === "" ? null : Number(form.maxElo);

  if (minEloNum !== null && maxEloNum !== null && minEloNum > maxEloNum) {
    errors.push({ field: "minElo", message: "Min ELO must be less than or equal to Max ELO" });
  }

  const maxEloGapNum = form.maxEloGap === "" ? null : Number(form.maxEloGap);
  if (maxEloGapNum !== null && maxEloGapNum <= 0) {
    errors.push({ field: "maxEloGap", message: "Max ELO gap must be positive" });
  }

  if (form.platforms.length === 0) {
    errors.push({ field: "platforms", message: "At least one platform must be selected" });
  }

  return errors;
}

const loadMatchRules = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getGuildMatchRules(getRequestHeaders(), data.guildId);
  });

const saveMatchRules = createServerFn({ method: "POST" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return {
      guildId: input.guildId,
      minElo: input.minElo === null || input.minElo === undefined ? null : Number(input.minElo),
      maxElo: input.maxElo === null || input.maxElo === undefined ? null : Number(input.maxElo),
      platforms: Array.isArray(input.platforms)
        ? input.platforms.filter((p): p is string => typeof p === "string")
        : null,
      requireVerified: Boolean(input.requireVerified),
      maxEloGap: typeof input.maxEloGap === "number" ? input.maxEloGap : Number(input.maxEloGap),
    };
  })
  .handler(async ({ data }) => {
    return upsertGuildMatchRules(getRequestHeaders(), data.guildId, {
      minElo: data.minElo,
      maxElo: data.maxElo,
      platforms: data.platforms,
      requireVerified: data.requireVerified,
      maxEloGap: data.maxEloGap,
    });
  });

export const Route = createFileRoute("/guild/$guildId/rules")({
  loader: ({ params }) => loadMatchRules({ data: { guildId: params.guildId } }),
  component: GuildRulesRoute,
});

function GuildRulesRoute() {
  const { guildId } = Route.useParams();
  const loaderData = Route.useLoaderData();

  const [form, setForm] = useState<MatchRulesForm>(() => rulesToForm(loaderData));
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<
    null | { type: "success"; message: string } | { type: "error"; message: string }
  >(null);

  const updateField = useCallback(
    <K extends keyof MatchRulesForm>(field: K, value: MatchRulesForm[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => prev.filter((e) => e.field !== field));
      setToast(null);
    },
    [],
  );

  const togglePlatform = useCallback((platform: PlatformValue) => {
    setForm((prev) => {
      const has = prev.platforms.includes(platform);
      const next = has
        ? prev.platforms.filter((p) => p !== platform)
        : [...prev.platforms, platform];
      return { ...prev, platforms: next };
    });
    setErrors((prev) => prev.filter((e) => e.field !== "platforms"));
    setToast(null);
  }, []);

  const getFieldError = useCallback(
    (field: string) => errors.find((e) => e.field === field)?.message ?? null,
    [errors],
  );

  const handleSave = useCallback(async () => {
    setToast(null);
    const validationErrors = validateForm(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setToast({ type: "error", message: "Please fix the validation errors below." });
      return;
    }

    setIsSaving(true);

    const payload = {
      guildId,
      minElo: form.minElo === "" ? null : Number(form.minElo),
      maxElo: form.maxElo === "" ? null : Number(form.maxElo),
      platforms: form.platforms.length > 0 ? form.platforms : null,
      requireVerified: form.requireVerified,
      maxEloGap: Number(form.maxEloGap),
    };

    try {
      const result = await saveMatchRules({ data: payload });
      if (result) {
        setToast({ type: "success", message: "Match rules saved successfully." });
      } else {
        setToast({ type: "error", message: "Failed to save match rules." });
      }
    } catch {
      setToast({ type: "error", message: "An unexpected error occurred while saving." });
    } finally {
      setIsSaving(false);
    }
  }, [form, guildId]);

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <h1 className="hq-title">Match Rules</h1>
        <p className="hq-subtitle">Server-specific match rules and regulations.</p>

        {toast && (
          <div
            className={`mt-6 flex items-center gap-2 rounded border px-4 py-3 text-sm ${
              toast.type === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {toast.type === "success" ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            {toast.message}
          </div>
        )}

        <div className="mt-6 grid gap-6">
          <Card className="hq-card">
            <CardHeader>
              <CardTitle>ELO Range</CardTitle>
              <CardDescription>Restrict matches to players within an ELO range.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className="filter-label">Min ELO</span>
                <input
                  type="number"
                  value={form.minElo}
                  onChange={(e) => updateField("minElo", e.target.value)}
                  placeholder="No minimum"
                  className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                />
                {getFieldError("minElo") && (
                  <span className="text-xs text-red-400">{getFieldError("minElo")}</span>
                )}
              </label>
              <label className="flex flex-col gap-2">
                <span className="filter-label">Max ELO</span>
                <input
                  type="number"
                  value={form.maxElo}
                  onChange={(e) => updateField("maxElo", e.target.value)}
                  placeholder="No maximum"
                  className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                />
              </label>
            </CardContent>
          </Card>

          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Platform Filtering</CardTitle>
              <CardDescription>Only allow players on selected platforms.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-4">
                {PLATFORM_OPTIONS.map((option) => (
                  <label
                    key={option.value}
                    className="inline-flex cursor-pointer items-center gap-2.5"
                  >
                    <div className="relative flex items-center">
                      <input
                        type="checkbox"
                        checked={form.platforms.includes(option.value)}
                        onChange={() => togglePlatform(option.value)}
                        className="peer h-4 w-4 appearance-none rounded border border-white/20 bg-white/[0.04] checked:border-accent-blue checked:bg-accent-blue focus:outline-none focus:ring-1 focus:ring-white/30"
                      />
                      <CheckCircle2
                        size={10}
                        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-white opacity-0 peer-checked:opacity-100"
                      />
                    </div>
                    <span className="text-sm text-white/80">{option.label}</span>
                  </label>
                ))}
              </div>
              {getFieldError("platforms") && (
                <span className="mt-2 block text-xs text-red-400">
                  {getFieldError("platforms")}
                </span>
              )}
            </CardContent>
          </Card>

          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Require Verified</CardTitle>
              <CardDescription>Only allow verified players to join matches.</CardDescription>
            </CardHeader>
            <CardContent>
              <label className="inline-flex cursor-pointer items-center gap-3">
                <div className="relative inline-flex h-5 w-9 items-center">
                  <input
                    type="checkbox"
                    checked={form.requireVerified}
                    onChange={(e) => updateField("requireVerified", e.target.checked)}
                    className="peer sr-only"
                  />
                  <span className="h-5 w-9 rounded-full bg-white/10 transition-colors peer-checked:bg-accent-blue" />
                  <span className="absolute left-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
                </div>
                <span className="text-sm text-white/80">Require verified players only</span>
              </label>
            </CardContent>
          </Card>

          <Card className="hq-card">
            <CardHeader>
              <CardTitle>Max ELO Gap</CardTitle>
              <CardDescription>
                Maximum ELO difference allowed between players in a match.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <label className="flex flex-col gap-2 sm:max-w-xs">
                <span className="filter-label">Max ELO Gap</span>
                <input
                  type="number"
                  value={form.maxEloGap}
                  onChange={(e) => updateField("maxEloGap", e.target.value)}
                  min={1}
                  className="h-9 rounded border border-white/10 bg-white/[0.04] px-3 text-sm text-white placeholder:text-white/40 outline-none focus:border-white/30 focus:ring-1 focus:ring-white/30"
                />
                {getFieldError("maxEloGap") && (
                  <span className="text-xs text-red-400">{getFieldError("maxEloGap")}</span>
                )}
              </label>
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button className="hq-button" onClick={handleSave} disabled={isSaving}>
              <Save size={14} />
              {isSaving ? "Saving..." : "Save Rules"}
            </Button>
          </div>
        </div>
      </div>
    </AuthGuard>
  );
}
