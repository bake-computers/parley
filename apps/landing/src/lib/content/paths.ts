/** Site path segments without leading slash (`` = home). */
export type SitePath = "" | "leaderboard" | "legal-notice" | "privacy" | "terms";

export function siteHref(path: SitePath): string {
  if (path === "") {
    return "/";
  }
  return `/${path}`;
}

export function homeSectionHref(sectionId: string): string {
  return `/#${sectionId}`;
}