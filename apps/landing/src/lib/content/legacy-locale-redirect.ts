const LEGACY_LOCALES = new Set(["en", "de"]);

/** Maps `/en/...` and `/de/...` to the English-only canonical path. */
export function canonicalPathFromLegacyLocale(pathname: string): string | null {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return null;
  }
  const [first, ...rest] = segments;
  if (!LEGACY_LOCALES.has(first)) {
    return null;
  }
  if (rest.length === 0) {
    return "/";
  }
  return `/${rest.join("/")}`;
}