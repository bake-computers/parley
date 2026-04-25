export interface SeasonCatalogEntry {
  slug: string;
  display: string;
  startedAt: string;
}

const BUILTIN_RECENT_SEASON_DISPLAYS = [
  "Prep Phase",
  "Collision Point",
  "Twin Shells",
  "New Blood",
  "Deadly Omen",
  "Deep Freeze",
  "Heavy Mettle",
  "Dread Factor",
  "Commanding Force",
  "Solar Raid",
] as const;

function normalizeText(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export function normalizeSeasonSelector(value: string): string {
  return normalizeText(value)
    .replace(/[_\s]+/g, "-")
    .replace(/-+/g, "-");
}

export function normalizeSeasonDisplay(value: string): string {
  return normalizeText(value).replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

export function canonicalizeSeasonSelector(
  selector: string,
  catalog: readonly SeasonCatalogEntry[],
): string | null {
  const trimmed = selector.trim();
  if (!trimmed) {
    return null;
  }

  const normalizedSlug = normalizeSeasonSelector(trimmed);
  const normalizedDisplay = normalizeSeasonDisplay(trimmed);

  for (const entry of catalog) {
    if (normalizeSeasonSelector(entry.slug) === normalizedSlug) {
      return entry.slug;
    }
  }

  for (const entry of catalog) {
    if (normalizeSeasonDisplay(entry.display) === normalizedDisplay) {
      return entry.slug;
    }
  }

  return null;
}

export function mergeSeasonCatalog(
  ...catalogs: readonly (readonly SeasonCatalogEntry[] | null | undefined)[]
): SeasonCatalogEntry[] {
  const merged = new Map<string, SeasonCatalogEntry>();

  for (const catalog of catalogs) {
    if (!catalog) {
      continue;
    }
    for (const entry of catalog) {
      if (!entry.slug.trim()) {
        continue;
      }

      const slug = normalizeSeasonSelector(entry.slug);
      const existing = merged.get(slug);
      if (!existing) {
        merged.set(slug, {
          slug,
          display: entry.display.trim() || entry.slug,
          startedAt: entry.startedAt,
        });
        continue;
      }

      if (entry.startedAt > existing.startedAt) {
        merged.set(slug, {
          slug,
          display: entry.display.trim() || existing.display,
          startedAt: entry.startedAt,
        });
      }
    }
  }

  return [...merged.values()].sort((left, right) => {
    if (left.startedAt === right.startedAt) {
      return left.slug.localeCompare(right.slug);
    }
    return right.startedAt.localeCompare(left.startedAt);
  });
}

export function buildBuiltinRecentSeasonCatalog(): SeasonCatalogEntry[] {
  return BUILTIN_RECENT_SEASON_DISPLAYS.map((display) => ({
    slug: normalizeSeasonSelector(display),
    display,
    startedAt: "",
  }));
}
