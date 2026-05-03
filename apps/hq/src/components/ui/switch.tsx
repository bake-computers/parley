import * as React from "react";

import { cn } from "#/lib/utils";

function Switch({
  className,
  checked,
  onCheckedChange,
  ...props
}: React.ComponentProps<"input"> & { onCheckedChange?: (checked: boolean) => void }) {
  return (
    <label
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out",
        checked ? "bg-white" : "bg-white/20",
        className,
      )}
    >
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        onChange={(e) => onCheckedChange?.(e.target.checked)}
        {...props}
      />
      <span
        className={cn(
          "pointer-events-none block size-5 rounded-full bg-black shadow-xs ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-5" : "translate-x-0",
        )}
      />
    </label>
  );
}

export { Switch };
