"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useLocale } from "#/lib/locale-messages-context";
import { cn } from "#/lib/utils";

export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "parley-theme";

const themeIcons: Record<Theme, typeof Sun> = {
  light: Sun,
  system: Monitor,
  dark: Moon,
};

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
  const { m } = useLocale();
  const themeLabels: Record<Theme, string> = {
    light: m.theme.light,
    system: m.theme.system,
    dark: m.theme.dark,
  };
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

  return (
    <div
      role="group"
      aria-label={m.theme.label}
      className={cn("flex items-center rounded-full bg-muted/60 p-0.5", className)}
    >
      {(["light", "system", "dark"] as const).map((value) => {
        const Icon = themeIcons[value];
        const label = themeLabels[value];
        return (
          <button
            key={value}
            type="button"
            onClick={() => select(value)}
            aria-label={label}
            aria-pressed={theme === value}
            title={label}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-all duration-200",
              theme === value
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}