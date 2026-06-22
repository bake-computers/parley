export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Path segments without locale prefix (e.g. `legal-notice`, `` for home). */
export type LocalizedPath =
  | ""
  | "leaderboard"
  | "legal-notice"
  | "privacy"
  | "terms";

export function localizedHref(locale: Locale, path: LocalizedPath): string {
  if (path === "") {
    return `/${locale}`;
  }
  return `/${locale}/${path}`;
}

export function homeSectionHref(locale: Locale, sectionId: string): string {
  return `/${locale}#${sectionId}`;
}