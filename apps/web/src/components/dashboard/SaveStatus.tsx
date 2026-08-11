import { Check, Loader2, TriangleAlert } from "lucide-react";
import type { SettingsSaveStatus } from "#/hooks/useSettingsSection";
import { cn } from "#/lib/shared/cn";

const LABELS: Record<Exclude<SettingsSaveStatus, "idle">, { text: string; className: string }> = {
  saving: {
    text: "Saving…",
    className: "text-muted-foreground",
  },
  saved: {
    text: "Saved",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  error: {
    text: "Error",
    className: "text-destructive",
  },
};

/** Compact autosave status shown next to a settings section header. */
export function SaveStatus({ status }: { status: SettingsSaveStatus }) {
  if (status === "idle") {
    return null;
  }
  const { text, className } = LABELS[status];
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-2.5 py-1 text-xs font-medium",
        className,
      )}
    >
      {status === "saving" ? (
        <Loader2 className="size-3.5 animate-spin" aria-hidden />
      ) : status === "saved" ? (
        <Check className="size-3.5" aria-hidden />
      ) : (
        <TriangleAlert className="size-3.5" aria-hidden />
      )}
      {text}
    </span>
  );
}
