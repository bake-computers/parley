import { cn } from "#/lib/shared/cn";

const controlClass =
  "border-input bg-background text-foreground placeholder:text-muted-foreground/70 focus-visible:ring-ring/50 h-11 w-full rounded-xl border px-3.5 text-sm outline-none transition-[border-color,box-shadow] focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50";

type FieldProps = {
  label: string;
  htmlFor?: string;
  error?: string | null;
  hint?: string;
  children: React.ReactNode;
  className?: string;
};

export function TournamentField({ label, htmlFor, error, hint, children, className }: FieldProps) {
  return (
    <label htmlFor={htmlFor} className={cn("flex flex-col gap-2", className)}>
      <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
        {label}
      </span>
      {children}
      {error ? <span className="text-destructive text-xs">{error}</span> : null}
      {!error && hint ? (
        <span className="text-muted-foreground text-xs leading-relaxed">{hint}</span>
      ) : null}
    </label>
  );
}

export function TournamentInput({
  className,
  invalid,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      className={cn(
        controlClass,
        invalid && "border-destructive focus-visible:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export function TournamentSelect({
  className,
  invalid,
  children,
  ...props
}: React.ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <select
      className={cn(
        controlClass,
        "appearance-none bg-[length:1rem] bg-[right_0.85rem_center] bg-no-repeat pr-10",
        "bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20fill%3D%22none%22%20viewBox%3D%220%200%2024%2024%22%20stroke%3D%22%23888%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22m6%209%206%206%206-6%22%2F%3E%3C%2Fsvg%3E')]",
        invalid && "border-destructive focus-visible:ring-destructive/30",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function TournamentTextarea({
  className,
  invalid,
  ...props
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      className={cn(
        controlClass,
        "min-h-[7.5rem] h-auto resize-y py-3 leading-relaxed",
        invalid && "border-destructive focus-visible:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}
