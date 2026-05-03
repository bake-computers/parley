import * as React from "react";

import { cn } from "#/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full rounded-md border border-white/12 bg-white/4 px-3 py-2 text-sm text-white shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-white/30 focus-visible:ring-[3px] focus-visible:ring-white/30 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
