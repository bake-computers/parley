import { load } from "cheerio";
import UserAgents from "user-agents";

const PLATFORM_SEARCH_ORDER = ["pc", "xbox", "playstation"] as const;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const USER_AGENT = new UserAgents({ deviceCategory: "desktop" }).toString();

const NUXT_WRAPPER_TAGS = new Set(["Reactive", "ShallowReactive", "Ref", "EmptyRef", "Set", "Map"]);

type DataMap = Record<string, any>;

interface ScrapedStats {
  profile: DataMap;
  ranked_stats: DataMap;
  calculated_metrics: DataMap;
}

interface ResolvedProfileTarget {
  username: string;
  uuid: string;
  platform: string;
  profileUrl: string;
}

interface ModeRecordSelection {
  seasonSlug: string;
  modeSlug: string;
  record: DataMap;
}

interface MatchRoundTotals {
  roundsPlayed: number;
  survivalRounds: number;
  tradedRounds: number;
  openingKillRounds: number;
  killRounds: number;
}

export class NuxtResolver {
  private memo = new Map<number, any>();
  private inProgress = new Set<number>();

  constructor(private readonly payload: any[]) {}

  resolve(value: any): any {
    if (typeof value === "number" && Number.isInteger(value)) {
      if (value === -1) {
        return null;
      }
      if (value >= 0 && value < this.payload.length) {
        return this.resolveIndex(value);
      }
      return value;
    }

    if (Array.isArray(value)) {
      if (
        value.length === 2 &&
        typeof value[0] === "string" &&
        NUXT_WRAPPER_TAGS.has(value[0]) &&
        typeof value[1] === "number" &&
        Number.isInteger(value[1])
      ) {
        return this.resolve(value[1]);
      }
      return value.map((item) => this.resolve(item));
    }

    if (value && typeof value === "object") {
      const keys = Object.keys(value);
      if (keys.length === 1 && keys[0] === "__i") {
        return null;
      }

      const resolved: DataMap = {};
      for (const [key, item] of Object.entries(value)) {
        resolved[key] = this.resolve(item);
      }
      return resolved;
    }

    return value;
  }

  resolveIndex(index: number): any {
    if (this.memo.has(index)) {
      return this.memo.get(index);
    }

    if (this.inProgress.has(index)) {
      return null;
    }

    this.inProgress.add(index);

    const entry = this.payload[index];
    let resolved: any;

    if (
      entry === null ||
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      resolved = entry === -1 ? null : entry;
    } else {
      resolved = this.resolve(entry);
    }

    this.memo.set(index, resolved);
    this.inProgress.delete(index);
    return resolved;
  }
}

export function parseIsoDatetime(value: string | undefined): Date | null {
  if (!value) {
    return null;
  }

  const dt = new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

export function extractNuxtPayload(html: string): any[] | null {
  const $ = load(html);
  const scriptContent = $("#__NUXT_DATA__").html();

  if (!scriptContent) {
    return null;
  }

  try {
    const parsed = JSON.parse(scriptContent);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function findProfileAndConstants(
  payload: any[],
  resolver: NuxtResolver,
): { profile: DataMap | null; constants: DataMap | null } {
  let profile: DataMap | null = null;
  let constants: DataMap | null = null;

  for (let index = 0; index < payload.length; index += 1) {
    const item = payload[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    if ("username" in item && "ranked_season_records" in item && "season_mode_records" in item) {
      profile = resolver.resolveIndex(index);
    }

    if ("rank_tiers" in item && "ranks" in item && "seasons" in item) {
      constants = resolver.resolveIndex(index);
    }
  }

  return { profile, constants };
}

export function rankLabel(
  rankSlug: string | undefined,
  ranks: DataMap,
  rankTiers: DataMap,
): { display: string; tier: string } {
  if (!rankSlug) {
    return { display: "Unknown", tier: "Unknown" };
  }

  const rankEntry = ranks[rankSlug] ?? {};
  const display = rankEntry.display ?? rankSlug;
  const tierSlug = rankEntry.tier;
  const tier = (tierSlug && rankTiers[tierSlug]?.display) ?? tierSlug ?? "Unknown";

  return { display, tier };
}

export function extractMatchesByPlaylist(
  payload: any[],
  resolver: NuxtResolver,
  playlist: "ranked" | "quickmatch" | null,
): DataMap[] {
  for (const item of payload) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }

    for (const [key, value] of Object.entries(item)) {
      if (!key.includes('"matches"')) {
        continue;
      }

      if (playlist && !key.includes(`"playlist":"${playlist}"`)) {
        continue;
      }

      const resolvedQuery = resolver.resolve(value);
      if (!Array.isArray(resolvedQuery) || resolvedQuery.length === 0) {
        continue;
      }

      const queryData = resolvedQuery[0];
      if (!queryData || typeof queryData !== "object") {
        continue;
      }

      const pages = queryData.pages;
      if (!Array.isArray(pages) || pages.length === 0) {
        continue;
      }

      const firstPage = pages[0];
      if (Array.isArray(firstPage)) {
        if (firstPage.length === 0) {
          continue;
        }
        return firstPage as DataMap[];
      }
    }
  }

  return [];
}

export function sortSeasonSlugsByStartDesc(seasonSlugs: string[], seasonsMeta: DataMap): string[] {
  return [...seasonSlugs].sort((left, right) => {
    const leftStarted = seasonsMeta[left]?.started_at ?? "";
    const rightStarted = seasonsMeta[right]?.started_at ?? "";

    if (leftStarted === rightStarted) {
      return right.localeCompare(left);
    }

    return rightStarted.localeCompare(leftStarted);
  });
}

export function findModeRecord(
  seasonModeRecords: DataMap,
  seasonsMeta: DataMap,
  modeMatcher: (modeSlug: string) => boolean,
): ModeRecordSelection | null {
  const seasonSlugs = sortSeasonSlugsByStartDesc(Object.keys(seasonModeRecords), seasonsMeta);
  let bestZeroMatchCandidate: ModeRecordSelection | null = null;

  for (const seasonSlug of seasonSlugs) {
    const seasonModes = seasonModeRecords[seasonSlug] ?? {};
    for (const [modeSlug, record] of Object.entries(seasonModes)) {
      if (!modeMatcher(modeSlug) || !record || typeof record !== "object") {
        continue;
      }

      const candidate: ModeRecordSelection = {
        seasonSlug,
        modeSlug,
        record: record as DataMap,
      };

      if (Number((record as DataMap).matches ?? 0) > 0) {
        return candidate;
      }

      if (!bestZeroMatchCandidate) {
        bestZeroMatchCandidate = candidate;
      }
    }
  }

  return bestZeroMatchCandidate;
}

export function summarizeMatchRounds(matches: DataMap[]): MatchRoundTotals {
  let roundsPlayed = 0;
  let survivalRounds = 0;
  let tradedRounds = 0;
  let openingKillRounds = 0;
  let killRounds = 0;

  for (const match of matches) {
    const summary: DataMap = match.player_summary ?? {};

    const rounds = Number(summary.rounds ?? 0);
    roundsPlayed += rounds;
    survivalRounds += Number(summary.round_survivals ?? 0);
    tradedRounds += Number(summary.trades ?? 0);
    openingKillRounds += Number(summary.opening_kills ?? 0);

    const kills = Number(summary.kills ?? 0);
    const kills2k = Number(summary.kills_2k ?? 0);
    const kills3k = Number(summary.kills_3k ?? 0);
    const kills4k = Number(summary.kills_4k ?? 0);
    const kills5k = Number(summary.kills_5k ?? 0);

    let roundsWithKill = kills - kills2k - 2 * kills3k - 3 * kills4k - 4 * kills5k;
    roundsWithKill = Math.max(0, Math.min(rounds, roundsWithKill));
    killRounds += roundsWithKill;
  }

  return {
    roundsPlayed,
    survivalRounds,
    tradedRounds,
    openingKillRounds,
    killRounds,
  };
}

export function parseResolvedProfileUrl(urlValue: string): { username: string; uuid: string } | null {
  try {
    const parsed = new URL(urlValue);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length < 3 || parts[0] !== "siege") {
      return null;
    }

    const username = decodeURIComponent(parts[1] ?? "");
    const uuid = (parts[2] ?? "").toLowerCase();
    if (!username || !UUID_REGEX.test(uuid)) {
      return null;
    }

    return { username, uuid };
  } catch {
    return null;
  }
}

export function normalizeDisplayName(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase();
}

export async function resolveProfileTarget(username: string): Promise<ResolvedProfileTarget | null> {
  const expectedDisplayName = normalizeDisplayName(username);

  for (const platform of PLATFORM_SEARCH_ORDER) {
    const lookupUrl = new URL("https://stats.cc/siege");
    lookupUrl.searchParams.set("displayName", username);
    lookupUrl.searchParams.set("platform", platform);

    try {
      const response = await fetch(lookupUrl.toString(), {
        redirect: "follow",
        headers: { "User-Agent": USER_AGENT },
      });
      if (!response.ok) {
        continue;
      }

      const resolved = parseResolvedProfileUrl(response.url);
      if (!resolved) {
        continue;
      }

      if (normalizeDisplayName(resolved.username) !== expectedDisplayName) {
        continue;
      }

      const profileUrl = `https://stats.cc/siege/${encodeURIComponent(resolved.username)}/${resolved.uuid}`;
      return {
        username: resolved.username,
        uuid: resolved.uuid,
        platform,
        profileUrl,
      };
    } catch {
      return null;
    }
  }

  return null;
}

export async function fetchAndScrapeStats(username: string): Promise<ScrapedStats | null> {
  const resolvedTarget = await resolveProfileTarget(username);
  if (!resolvedTarget) {
    console.error(`Could not resolve UUID for username: ${username}`);
    return null;
  }

  try {
    const rankedProfileUrl = new URL(resolvedTarget.profileUrl);
    rankedProfileUrl.searchParams.set("addToRecents", "true");
    rankedProfileUrl.searchParams.set("playlist", "ranked");

    const response = await fetch(rankedProfileUrl.toString(), {
      headers: {
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) {
      console.error(`Error fetching page: ${response.status}`);
      return null;
    }

    const html = await response.text();
    const stats = scrapeHtmlStats(html);
    stats.profile.profile_id = resolvedTarget.uuid;
    stats.profile.platform = resolvedTarget.platform;
    stats.profile.profile_url = resolvedTarget.profileUrl;

    return stats;
  } catch (error) {
    console.error("Error fetching data:", error);
    return null;
  }
}

export function scrapeHtmlStats(html: string): ScrapedStats {
  const stats: ScrapedStats = {
    profile: {},
    ranked_stats: {},
    calculated_metrics: {},
  };

  const payload = extractNuxtPayload(html);
  if (!payload) {
    console.error("Could not locate __NUXT_DATA__ payload");
    return stats;
  }

  const resolver = new NuxtResolver(payload);
  const { profile, constants } = findProfileAndConstants(payload, resolver);

  if (!profile || !constants) {
    console.error("Could not resolve structured profile data");
    return stats;
  }

  const username = profile.username ?? "Unknown";
  stats.profile.username = username;
  stats.profile.level = profile.level ?? 0;

  const rankedSeasons: DataMap = profile.ranked_season_records ?? {};
  const seasonModeRecords: DataMap = profile.season_mode_records ?? {};
  const seasonsMeta: DataMap = constants.seasons ?? {};
  const ranks: DataMap = constants.ranks ?? {};
  const rankTiers: DataMap = constants.rank_tiers ?? {};

  const seasonKeys = Object.keys(rankedSeasons);
  if (seasonKeys.length === 0) {
    const quickModeSelection = findModeRecord(
      seasonModeRecords,
      seasonsMeta,
      (modeSlug) => modeSlug.includes("quick-match") || modeSlug.includes("quickmatch"),
    );
    const fallbackModeSelection =
      quickModeSelection ?? findModeRecord(seasonModeRecords, seasonsMeta, () => true);

    if (fallbackModeSelection) {
      const { seasonSlug, modeSlug, record } = fallbackModeSelection;

      const quickMatches = extractMatchesByPlaylist(payload, resolver, "quickmatch");
      const pastMatches =
        quickMatches.length > 0 ? quickMatches : extractMatchesByPlaylist(payload, resolver, null);

      const seasonStart = parseIsoDatetime(seasonsMeta[seasonSlug]?.started_at);
      const seasonMatches = seasonStart
        ? pastMatches.filter((match) => {
            const startedAt = parseIsoDatetime(match.started_at);
            return startedAt ? startedAt >= seasonStart : false;
          })
        : pastMatches;

      const rounds = summarizeMatchRounds(seasonMatches);

      const matches = Number(record.matches ?? seasonMatches.length ?? 0);
      const wins = Number(record.wins ?? 0);
      const losses = Number(record.losses ?? 0);
      const kills = Number(record.kills ?? 0);
      const deaths = Number(record.deaths ?? 0);
      const assists = Number(record.assists ?? 0);
      const headshots = Number(record.headshots ?? 0);

      const kdRatio = deaths > 0 ? kills / deaths : kills;
      const headshotRate = kills > 0 ? (headshots / kills) * 100 : 0;
      const winRate = matches > 0 ? (wins / matches) * 100 : 0;

      stats.ranked_stats = {
        season: seasonSlug,
        mode: modeSlug,
        matches,
        wins,
        losses,
        abandons: Number(record.abandons ?? 0),
        kills,
        deaths,
        assists,
        headshots,
        kd_ratio: Number(Number(record.kd ?? kdRatio).toFixed(4)),
        headshot_percentage: Number(Number(record.hs ?? headshotRate).toFixed(2)),
        win_rate: Number(Number(record.wr ?? winRate).toFixed(2)),
        rank_points: 0,
        peak_rank_points: 0,
        current_rank_slug: null,
        current_rank: "Unranked",
        current_rank_tier: "Unranked",
        peak_rank_slug: null,
        peak_rank: "Unranked",
        peak_rank_tier: "Unranked",
        all_time_peak_rank_slug: null,
        all_time_peak_rank: "Unranked",
        all_time_peak_rank_tier: "Unranked",
        all_time_peak_rank_points: 0,
        all_time_peak_rank_season: null,
        rounds_played: rounds.roundsPlayed,
        kill_rounds: rounds.killRounds,
        survival_rounds: rounds.survivalRounds,
        traded_rounds: rounds.tradedRounds,
        opening_kill_rounds: rounds.openingKillRounds,
        matches_in_cache: seasonMatches.length,
      };

      const sourceLabel = quickModeSelection ? "quickmatch" : "past mode";
      console.log(
        `No ranked season records for ${username}; using ${sourceLabel} stats from ` +
          `${seasonSlug}/${modeSlug}`,
      );
      return stats;
    }

    const pastMatches = extractMatchesByPlaylist(payload, resolver, null);
    if (pastMatches.length > 0) {
      let kills = 0;
      let deaths = 0;
      let assists = 0;
      let headshots = 0;
      let wins = 0;
      let losses = 0;
      let abandons = 0;

      for (const match of pastMatches) {
        const summary: DataMap = match.player_summary ?? {};
        kills += Number(summary.kills ?? 0);
        deaths += Number(summary.deaths ?? 0);
        assists += Number(summary.assists ?? 0);
        headshots += Number(summary.headshots ?? 0);
        abandons += Number(summary.abandons ?? 0);

        const won = summary.won ?? summary.win;
        if (won === true || won === 1 || won === "win") {
          wins += 1;
        } else if (won === false || won === 0 || won === "loss") {
          losses += 1;
        }
      }

      const rounds = summarizeMatchRounds(pastMatches);
      const matches = pastMatches.length;
      const kdRatio = deaths > 0 ? kills / deaths : kills;
      const headshotRate = kills > 0 ? (headshots / kills) * 100 : 0;
      const winRate = matches > 0 ? (wins / matches) * 100 : 0;

      stats.ranked_stats = {
        season: "",
        mode: "past-matches",
        matches,
        wins,
        losses,
        abandons,
        kills,
        deaths,
        assists,
        headshots,
        kd_ratio: Number(kdRatio.toFixed(4)),
        headshot_percentage: Number(headshotRate.toFixed(2)),
        win_rate: Number(winRate.toFixed(2)),
        rank_points: 0,
        peak_rank_points: 0,
        current_rank_slug: null,
        current_rank: "Unranked",
        current_rank_tier: "Unranked",
        peak_rank_slug: null,
        peak_rank: "Unranked",
        peak_rank_tier: "Unranked",
        all_time_peak_rank_slug: null,
        all_time_peak_rank: "Unranked",
        all_time_peak_rank_tier: "Unranked",
        all_time_peak_rank_points: 0,
        all_time_peak_rank_season: null,
        rounds_played: rounds.roundsPlayed,
        kill_rounds: rounds.killRounds,
        survival_rounds: rounds.survivalRounds,
        traded_rounds: rounds.tradedRounds,
        opening_kill_rounds: rounds.openingKillRounds,
        matches_in_cache: pastMatches.length,
      };

      console.log(
        `No ranked or quickmatch season records for ${username}; using past matches summary`,
      );
      return stats;
    }

    console.error("No ranked season records, quickmatch records, or past matches found in payload");
    return stats;
  }

  const currentSeasonSlug = seasonKeys.reduce((latest, slug) => {
    const latestStarted = seasonsMeta[latest]?.started_at ?? "";
    const started = seasonsMeta[slug]?.started_at ?? "";
    return started > latestStarted ? slug : latest;
  });

  const currentSeason = rankedSeasons[currentSeasonSlug] ?? {};

  const currentRankSlug = currentSeason.rank;
  const peakRankSlug = currentSeason.max_rank;

  const currentRank = rankLabel(currentRankSlug, ranks, rankTiers);
  const peakRank = rankLabel(peakRankSlug, ranks, rankTiers);

  let allTimePeakSeason: string | null = null;
  let allTimePeakRecord: DataMap | null = null;
  let allTimePeakPoints = -1;

  for (const [seasonSlug, record] of Object.entries(rankedSeasons)) {
    const points = Number((record as DataMap).max_rank_points ?? 0);
    if (points > allTimePeakPoints) {
      allTimePeakPoints = points;
      allTimePeakSeason = seasonSlug;
      allTimePeakRecord = record as DataMap;
    }
  }

  const allTimePeakSlug = allTimePeakRecord?.max_rank;
  const allTimePeakRank = rankLabel(allTimePeakSlug, ranks, rankTiers);

  let currentModeRecord: DataMap = seasonModeRecords[currentSeasonSlug]?.["ranked-bomb"] ?? {};
  if (!currentModeRecord || Object.keys(currentModeRecord).length === 0) {
    const seasonModes = seasonModeRecords[currentSeasonSlug] ?? {};
    for (const [modeSlug, record] of Object.entries(seasonModes)) {
      if (modeSlug.includes("ranked") && record && typeof record === "object") {
        currentModeRecord = record as DataMap;
        break;
      }
    }
  }

  const rankedMatches = extractMatchesByPlaylist(payload, resolver, "ranked");
  const seasonStart = parseIsoDatetime(seasonsMeta[currentSeasonSlug]?.started_at);

  const seasonMatches = seasonStart
    ? rankedMatches.filter((match) => {
        const startedAt = parseIsoDatetime(match.started_at);
        return startedAt ? startedAt >= seasonStart : false;
      })
    : rankedMatches;

  const rounds = summarizeMatchRounds(seasonMatches);

  stats.ranked_stats = {
    season: currentSeasonSlug,
    matches: Number(currentModeRecord.matches ?? 0),
    wins: Number(currentModeRecord.wins ?? 0),
    losses: Number(currentModeRecord.losses ?? 0),
    abandons: Number(currentModeRecord.abandons ?? 0),
    kills: Number(currentModeRecord.kills ?? 0),
    deaths: Number(currentModeRecord.deaths ?? 0),
    assists: Number(currentModeRecord.assists ?? 0),
    headshots: Number(currentModeRecord.headshots ?? 0),
    kd_ratio: Number(Number(currentModeRecord.kd ?? 0).toFixed(4)),
    headshot_percentage: Number(Number(currentModeRecord.hs ?? 0).toFixed(2)),
    win_rate: Number(Number(currentModeRecord.wr ?? 0).toFixed(2)),
    rank_points: Number(currentSeason.rank_points ?? 0),
    peak_rank_points: Number(currentSeason.max_rank_points ?? 0),
    current_rank_slug: currentRankSlug,
    current_rank: currentRank.display,
    current_rank_tier: currentRank.tier,
    peak_rank_slug: peakRankSlug,
    peak_rank: peakRank.display,
    peak_rank_tier: peakRank.tier,
    all_time_peak_rank_slug: allTimePeakSlug,
    all_time_peak_rank: allTimePeakRank.display,
    all_time_peak_rank_tier: allTimePeakRank.tier,
    all_time_peak_rank_points: Math.max(0, allTimePeakPoints),
    all_time_peak_rank_season: allTimePeakSeason,
    rounds_played: rounds.roundsPlayed,
    kill_rounds: rounds.killRounds,
    survival_rounds: rounds.survivalRounds,
    traded_rounds: rounds.tradedRounds,
    opening_kill_rounds: rounds.openingKillRounds,
    matches_in_cache: seasonMatches.length,
  };

  return stats;
}

export function calculateKost(rankedStats: DataMap): number {
  try {
    const roundsPlayed = Number(rankedStats.rounds_played ?? 0);
    if (roundsPlayed <= 0) {
      return 0;
    }

    const killRounds = Number(rankedStats.kill_rounds ?? 0);
    const survivalRounds = Number(rankedStats.survival_rounds ?? 0);
    const tradedRounds = Number(rankedStats.traded_rounds ?? 0);

    const lowerBound = Math.max(killRounds, survivalRounds, tradedRounds);
    const upperBound = Math.min(roundsPlayed, killRounds + survivalRounds + tradedRounds);
    const estimateRounds = (lowerBound + upperBound) / 2;

    return Number(((estimateRounds / roundsPlayed) * 100).toFixed(2));
  } catch {
    return 0;
  }
}

export function formatOutput(scrapedStats: ScrapedStats): DataMap {
  const ranked = scrapedStats.ranked_stats ?? {};

  const roundsPlayed = Number(ranked.rounds_played ?? 0);
  const killRounds = Number(ranked.kill_rounds ?? 0);
  const survivalRounds = Number(ranked.survival_rounds ?? 0);
  const tradedRounds = Number(ranked.traded_rounds ?? 0);

  const kostLowerBound =
    roundsPlayed > 0
      ? Number(
          ((Math.max(killRounds, survivalRounds, tradedRounds) / roundsPlayed) * 100).toFixed(2),
        )
      : 0;

  const kostUpperBound =
    roundsPlayed > 0
      ? Number(
          (
            (Math.min(roundsPlayed, killRounds + survivalRounds + tradedRounds) / roundsPlayed) *
            100
          ).toFixed(2),
        )
      : 0;

  return {
    profile: scrapedStats.profile ?? {},
    ranked_stats: {
      kills: ranked.kills ?? 0,
      deaths: ranked.deaths ?? 0,
      kd_ratio: ranked.kd_ratio ?? 0,
      headshots: ranked.headshots ?? 0,
      headshot_percentage: ranked.headshot_percentage ?? 0,
      assists: ranked.assists ?? 0,
      rounds_played: ranked.rounds_played ?? 0,
      win_rate: ranked.win_rate ?? 0,
      matches: ranked.matches ?? 0,
      season: ranked.season ?? "",
      rank_points: ranked.rank_points ?? 0,
      current_rank: ranked.current_rank ?? "Unknown",
      current_rank_tier: ranked.current_rank_tier ?? "Unknown",
      peak_rank: ranked.peak_rank ?? "Unknown",
      peak_rank_tier: ranked.peak_rank_tier ?? "Unknown",
      all_time_peak_rank: ranked.all_time_peak_rank ?? "Unknown",
      all_time_peak_rank_tier: ranked.all_time_peak_rank_tier ?? "Unknown",
      all_time_peak_rank_season: ranked.all_time_peak_rank_season ?? "",
      all_time_peak_rank_points: ranked.all_time_peak_rank_points ?? 0,
    },
    calculated_metrics: {
      kost: calculateKost(ranked),
      kost_lower_bound: kostLowerBound,
      kost_upper_bound: kostUpperBound,
      kost_description:
        "Estimated KOST% from aggregated match summaries (no round-level K/O/S/T flags in payload)",
    },
  };
}
