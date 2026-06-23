import { cn } from "#/lib/shared/cn";

type Props = {
  visible: boolean;
  saving: boolean;
  canSave: boolean;
  validationError?: string | null;
  error?: string | null;
  onReset: () => void;
  onSave: () => void;
};

export function SettingsSaveBar({
  visible,
  saving,
  canSave,
  validationError,
  error,
  onReset,
  onSave,
}: Props) {
  return (
    <div
      className={cn(
        "fixed inset-x-0 bottom-3 z-50 flex justify-center px-6 transition-all duration-300 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0",
      )}
      role="region"
      aria-label="Unsaved changes"
      aria-hidden={!visible}
    >
      <div className="flex w-full max-w-2xl flex-col gap-2 rounded-xl border border-border/70 bg-card/95 px-4 py-3 shadow-2xl backdrop-blur-md sm:px-5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-foreground min-w-0 text-sm">
            {error ?? (validationError && !canSave ? validationError : "You have unsaved changes.")}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={onReset}
              disabled={saving}
              className="text-muted-foreground hover:text-foreground rounded-lg px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted/60 disabled:opacity-50"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!canSave}
              className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}