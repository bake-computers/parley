"use client";

import { useEffect, useState } from "react";
import { cn } from "#/lib/utils";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "parley-theme";

function getSystemTheme(): "light" | "dark" {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export function getStoredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const stored = getStoredTheme();
    setTheme(stored);
    applyTheme(stored);

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (getStoredTheme() === "system") {
        applyTheme("system");
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const select = (next: Theme) => {
    localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
    applyTheme(next);
  };

  const options: { value: Theme; label: string }[] = [
    { value: "light", label: "Light" },
    { value: "system", label: "System" },
    { value: "dark", label: "Dark" },
  ];

  return (
    <div
      role="group"
      aria-label="Theme"
      className={cn("flex items-center rounded-full bg-muted/60 p-0.5", className)}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => select(opt.value)}
          aria-pressed={theme === opt.value}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition-all duration-200",
            theme === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}