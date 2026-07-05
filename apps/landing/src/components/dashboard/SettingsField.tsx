import { cn } from "#/lib/shared/cn";

const inputClass =
  "border-input bg-background focus-visible:ring-ring/50 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-3";

type FieldProps = {
  label: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
};

export function SettingsField({ label, error, hint, children }: FieldProps) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      {children}
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
      {!error && hint ? <span className="text-muted-foreground text-xs">{hint}</span> : null}
    </label>
  );
}

export function SettingsInput({
  className,
  invalid,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        inputClass,
        invalid && "border-destructive focus-visible:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export function SettingsToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const on = Boolean(checked);

  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{label}</span>
        {description ? (
          <span className="text-muted-foreground mt-0.5 block text-xs">{description}</span>
        ) : null}
      </span>
      <span
        className="relative inline-block shrink-0"
        style={{ width: 48, height: 28, minWidth: 48, minHeight: 28 }}
      >
        <input
          type="checkbox"
          role="switch"
          aria-checked={on}
          aria-label={label}
          className="peer sr-only"
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          aria-hidden
          className={cn(
            "flex h-full w-full items-center rounded-full border p-0.5 transition-[background-color,border-color] duration-200 motion-reduce:transition-none",
            "peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
            on
              ? "justify-end border-[#1e8e4a] bg-[#23a559]"
              : "justify-start border-black/10 bg-[#b5bac1] dark:border-white/10 dark:bg-[#4e5058]",
          )}
        >
          <span
            className="block rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-1 ring-black/10"
            style={{ width: 22, height: 22, minWidth: 22, minHeight: 22 }}
          />
        </span>
      </span>
    </label>
  );
}
