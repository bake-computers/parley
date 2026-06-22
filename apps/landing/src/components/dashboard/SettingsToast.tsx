import { useEffect } from "react";
import { cn } from "#/lib/utils";

export function SettingsToast({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!message) {
      return;
    }
    const t = setTimeout(onDismiss, 2800);
    return () => clearTimeout(t);
  }, [message, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none fixed inset-x-0 top-4 z-[60] flex justify-center px-6 transition-all duration-300 motion-reduce:transition-none",
        message ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
      )}
    >
      <p className="rounded-lg border border-border/70 bg-card px-4 py-2 text-sm shadow-lg">
        {message ?? ""}
      </p>
    </div>
  );
}