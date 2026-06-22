import { useRouterState } from "@tanstack/react-router";
import { LOCALES, type Locale } from "#/lib/i18n";
import { useLocale } from "#/lib/locale-messages-context";
import { cn } from "#/lib/utils";

function swapLocaleInPath(pathname: string, next: Locale): string {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) {
    return `/${next}`;
  }
  if (LOCALES.includes(parts[0] as Locale)) {
    parts[0] = next;
    return `/${parts.join("/")}`;
  }
  return `/${next}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

export function LocaleSwitch({ className }: { className?: string }) {
  const { locale, m } = useLocale();
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  return (
    <div
      className={cn("flex items-center gap-0.5 rounded-full border border-border/50 p-0.5", className)}
      role="group"
      aria-label={m.localeSwitch.label}
    >
      {LOCALES.map((code) => (
        <a
          key={code}
          href={swapLocaleInPath(pathname, code)}
          hrefLang={code}
          className={cn(
            "min-w-9 rounded-full px-2 py-1.5 text-center text-xs font-semibold transition-colors",
            locale === code
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground",
          )}
          aria-current={locale === code ? "true" : undefined}
        >
          {m.localeSwitch[code]}
        </a>
      ))}
    </div>
  );
}