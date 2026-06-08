/**
 * Parley engine-service ad-hoc client.
 *
 * Usage:
 *   bun run scripts/engine-client.ts [ENGINE_URL]
 *
 * Defaults to http://127.0.0.1:50051 unless ENGINE_URL env var or first arg
 * overrides it.
 *
 * Every RPC is exposed as a plain async function. Edit the main() block at the
 * bottom to call whatever you need.
 *
 * Protocol: ConnectRPC unary (JSON-encoded). POST /pkg.Service/Method with
 * Content-Type: application/json.
 */

const GAME_R6 = 1;
const GAME_BRAWL_STARS = 2;

type Game = typeof GAME_R6 | typeof GAME_BRAWL_STARS;

interface ErrorResponse {
  code: string;
  message: string;
}

async function call<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as T & { error?: ErrorResponse };
  if (!res.ok) {
    const err = json.error;
    throw new Error(
      `[${res.status}] ${err?.code ?? "unknown"}: ${err?.message ?? JSON.stringify(json)}`,
    );
  }
  return json;
}

export async function health(baseUrl: string) {
  const res = await fetch(`${baseUrl}/health`);
  return { status: res.status, body: await res.text() };
}

export async function ready(baseUrl: string) {
  const res = await fetch(`${baseUrl}/ready`);
  return { status: res.status, body: await res.text() };
}

export interface LinkAccountRequest {
  discordUserId: string;
  game: Game;
  username: string;
  platform: string;
  guildId?: string;
}

export interface LinkAccountResponse {
  success: boolean;
  playerId: number;
  usernameNormalized: string;
  error?: ErrorResponse;
}

export function linkAccount(baseUrl: string, req: LinkAccountRequest) {
  return call<LinkAccountResponse>(baseUrl, "/parley.identity.v1.IdentityService/LinkAccount", req);
}

export interface UnlinkAccountRequest {
  discordUserId: string;
  game: Game;
}

export interface UnlinkAccountResponse {
  success: boolean;
  removed: number;
  error?: ErrorResponse;
}

export function unlinkAccount(baseUrl: string, req: UnlinkAccountRequest) {
  return call<UnlinkAccountResponse>(
    baseUrl,
    "/parley.identity.v1.IdentityService/UnlinkAccount",
    req,
  );
}

export interface LookupByDiscordRequest {
  discordUserId: string;
  game?: Game;
}

export interface LinkedIdentity {
  game: Game;
  discordUserId: string;
  playerId: number;
  username: string;
  usernameNormalized: string;
  platform: string;
  profileId: string;
  profileUrl: string;
  internalElo: number;
  internalMatches: number;
  internalWins: number;
  internalLosses: number;
}

export interface LookupByDiscordResponse {
  success: boolean;
  identities: LinkedIdentity[];
  error?: ErrorResponse;
}

export function lookupByDiscord(baseUrl: string, req: LookupByDiscordRequest) {
  return call<LookupByDiscordResponse>(
    baseUrl,
    "/parley.identity.v1.IdentityService/LookupByDiscord",
    req,
  );
}

export interface LookupByUsernameRequest {
  game: Game;
  username: string;
  platform: string;
}

export interface LookupByUsernameResponse {
  success: boolean;
  identity?: LinkedIdentity;
  error?: ErrorResponse;
}

export function lookupByUsername(baseUrl: string, req: LookupByUsernameRequest) {
  return call<LookupByUsernameResponse>(
    baseUrl,
    "/parley.identity.v1.IdentityService/LookupByUsername",
    req,
  );
}

export interface GuildSettingsPayload {
  guildId: string;
  game: Game;
  defaultTeamFormat: string;
  autoBalance: boolean;
  crossGuildMatchmaking: boolean;
  updatedAtMs: number;
  updatedByDiscordUserId: string;
}

export interface GetGuildSettingsRequest {
  guildId: string;
  game: Game;
}

export interface UpsertGuildSettingsRequest {
  settings: GuildSettingsPayload;
}

export interface GuildSettingsResponse {
  success: boolean;
  settings?: GuildSettingsPayload;
  error?: ErrorResponse;
}

export function getGuildSettings(baseUrl: string, req: GetGuildSettingsRequest) {
  return call<GuildSettingsResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/GetGuildSettings",
    req,
  );
}

export function upsertGuildSettings(baseUrl: string, req: UpsertGuildSettingsRequest) {
  return call<GuildSettingsResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/UpsertGuildSettings",
    req,
  );
}

export interface GuildMatchmakingRulesPayload {
  guildId: string;
  game: Game;
  minElo: number;
  maxElo: number;
  platforms: string[];
  requireVerified: boolean;
  maxEloGap: number;
  updatedAtMs: number;
}

export interface GetMatchmakingRulesRequest {
  guildId: string;
  game: Game;
}

export interface UpsertMatchmakingRulesRequest {
  rules: GuildMatchmakingRulesPayload;
}

export interface GuildMatchmakingRulesResponse {
  success: boolean;
  rules?: GuildMatchmakingRulesPayload;
  error?: ErrorResponse;
}

export function getMatchmakingRules(baseUrl: string, req: GetMatchmakingRulesRequest) {
  return call<GuildMatchmakingRulesResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/GetMatchmakingRules",
    req,
  );
}

export function upsertMatchmakingRules(baseUrl: string, req: UpsertMatchmakingRulesRequest) {
  return call<GuildMatchmakingRulesResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/UpsertMatchmakingRules",
    req,
  );
}

export interface GuildNotificationSettingsPayload {
  guildId: string;
  game: Game;
  matchResultsChannel: string;
  tournamentAnnouncementsChannel: string;
  leaderboardUpdatesEnabled: boolean;
  updatedAtMs: number;
}

export interface GetNotificationSettingsRequest {
  guildId: string;
  game: Game;
}

export interface UpsertNotificationSettingsRequest {
  settings: GuildNotificationSettingsPayload;
}

export interface GuildNotificationSettingsResponse {
  success: boolean;
  settings?: GuildNotificationSettingsPayload;
  error?: ErrorResponse;
}

export function getNotificationSettings(baseUrl: string, req: GetNotificationSettingsRequest) {
  return call<GuildNotificationSettingsResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/GetNotificationSettings",
    req,
  );
}

export function upsertNotificationSettings(
  baseUrl: string,
  req: UpsertNotificationSettingsRequest,
) {
  return call<GuildNotificationSettingsResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/UpsertNotificationSettings",
    req,
  );
}

export interface GuildMatchQuotaPayload {
  guildId: string;
  game: Game;
  dailyMatchLimit: number;
  updatedByDiscordUserId: string;
  updatedAtMs: number;
}

export interface GetMatchQuotasRequest {
  guildId: string;
  game: Game;
}

export interface UpsertMatchQuotasRequest {
  quota: GuildMatchQuotaPayload;
}

export interface GuildMatchQuotasResponse {
  success: boolean;
  quotas?: GuildMatchQuotaPayload;
  error?: ErrorResponse;
}

export function getMatchQuotas(baseUrl: string, req: GetMatchQuotasRequest) {
  return call<GuildMatchQuotasResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/GetMatchQuotas",
    req,
  );
}

export function upsertMatchQuotas(baseUrl: string, req: UpsertMatchQuotasRequest) {
  return call<GuildMatchQuotasResponse>(
    baseUrl,
    "/parley.guild.v1.GuildSettingsService/UpsertMatchQuotas",
    req,
  );
}

const PLATFORM_AUTO = 0;
const PLATFORM_PC = 1;
const PLATFORM_XBOX = 2;
const PLATFORM_PLAYSTATION = 3;

type StatsPlatform =
  | typeof PLATFORM_AUTO
  | typeof PLATFORM_PC
  | typeof PLATFORM_XBOX
  | typeof PLATFORM_PLAYSTATION;

export interface FetchStatsRequest {
  username: string;
  platform: StatsPlatform;
  seasonSelector?: string;
  game?: Game;
}

export interface FetchStatsResponse {
  success: boolean;
  // stats is a complex nested structure — see ScrapedStats proto type
  stats?: unknown;
  error?: ErrorResponse;
}

export function fetchStats(baseUrl: string, req: FetchStatsRequest) {
  return call<FetchStatsResponse>(baseUrl, "/parley.stats.v1.StatsService/FetchStats", req);
}

export interface FetchStatsCollectionRequest {
  username: string;
  platform: StatsPlatform;
  game?: Game;
}

export interface FetchStatsCollectionResponse {
  success: boolean;
  // collection is a complex nested structure — see ScrapedStatsCollection proto type
  collection?: unknown;
  error?: ErrorResponse;
}

export function fetchStatsCollection(baseUrl: string, req: FetchStatsCollectionRequest) {
  return call<FetchStatsCollectionResponse>(
    baseUrl,
    "/parley.stats.v1.StatsService/FetchStatsCollection",
    req,
  );
}

const LEADERBOARD_ELO = 1;
const LEADERBOARD_WIN_RATE = 2;
const LEADERBOARD_RANK_POINTS = 3;

type LeaderboardType =
  | typeof LEADERBOARD_ELO
  | typeof LEADERBOARD_WIN_RATE
  | typeof LEADERBOARD_RANK_POINTS;

export interface GetLeaderboardRequest {
  game: Game;
  guildId: string;
  type: LeaderboardType;
  limit: number;
  offset: number;
}

export interface LeaderboardEntry {
  playerId: string;
  username: string;
  rank: string;
  score: number;
  matches: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface GetLeaderboardResponse {
  entries: LeaderboardEntry[];
  totalCount: string;
}

export function getLeaderboard(baseUrl: string, req: GetLeaderboardRequest) {
  return call<GetLeaderboardResponse>(
    baseUrl,
    "/parley.leaderboard.v1.LeaderboardService/GetLeaderboard",
    req,
  );
}

export interface GetPlayerRankRequest {
  game: Game;
  guildId: string;
  playerId: string;
  type: LeaderboardType;
}

export interface GetPlayerRankResponse {
  entry?: LeaderboardEntry;
}

export function getPlayerRank(baseUrl: string, req: GetPlayerRankRequest) {
  return call<GetPlayerRankResponse>(
    baseUrl,
    "/parley.leaderboard.v1.LeaderboardService/GetPlayerRank",
    req,
  );
}

const TOP_PLAYERS = [
  "GriII",
  "Aiden.SSG",
  "Mikasa",
  "MingJce",
  "Swlsher",
  "fsu",
  "creeds",
  "zkcz",
  "GENDARMERlE",
  "TrojanRat",
  "mue",
  "PugR6S",
  "Causing",
  "Viherk-",
  "ltzPanda.Rip",
  "SnowStrippers",
  "iywo",
  "Xerqzlax.C9",
  "cxkegirls",
  "Lugano777",
  "Fi9ure",
  "Azezd.",
  "azko92",
  "caamero.",
  "Siyheelu",
  "stzv",
  "SmackingOpps",
  "gek",
  "xohhVPN",
  "Joshaven",
  "sguindy",
  "Memphis",
  "pokerjr",
  "Kippu_JJ",
  "jobbi.",
  "Tamime247",
  "omy",
  "Tukkleton",
  "Jefferson.JPG",
  "MargieIaBag",
  "Toko2turNt",
  "Raid.SSG",
  "Pauxxle",
  "MeM4m4ai",
  "Ambi.SR",
  "tt-coinfuzz",
  "ka7e...",
  "TTVAzheed",
  "blob.ZT",
  "Riccicapo",
  "ph9ntm",
  "Bapnzao",
  "v7--",
  "iatina.cp",
  "shenVIogs",
  "Fenz.5F",
  "Alizawerf",
  "JoeDaGreat8",
  "Wizard.FNC",
  "parlaSharKK",
  "Effect2K",
  "Relaes.CHIEFS",
  "Sliko.",
  "dxce.",
  "Pururuca-.",
  "Rockytop",
  "fxntomss",
  "asdfyLayla",
  "t_yl",
  "Yuhip.JPG",
  "mThree.",
  "MlKE-.-",
  "displaced",
  "mxezz",
  "h8td-",
  "SPOKENBONKAI",
  "ArculIy.CAG",
  "StopGraee",
  "Ponders",
  "Mv.MYD",
  "Stompn.G2",
  "JellyBaits",
  "fonust540",
  "xmvo",
  "withvon",
  "F1iiNTYS",
  "b.ootz",
  "BuIItumbo",
  "Konjuy.",
  "Stressi.Kanone",
  "Rival.SSG",
  "KAYASuOWO",
  "Sps7",
  "Dnamite",
  "Gizbo.Kanone",
  "duck.OLDSTAR",
  "Lowkyy.MYD",
  "Skyte-",
  "Septis",
  "Gabu7z.LOUD",
  "b0xo.ARC",
  "Baelezera",
  "Elemzje.Rebels",
  "Shift.TV8",
  "Kobelax",
  "k-aylr",
  "BringYourLove",
  "daefromhell",
  "thrtn.SK",
  "ScusPope",
  "KungFuErz",
  "KidjoTK",
  "sgsla",
  "BobzGN",
  "prevailing",
  "Snoopbulla",
  "isoheru",
  "Fifties.AOT",
  "MKG",
  "Rude.xyz",
  "BleachCapone",
  "kirimpitbulll",
  "Adenn.oL",
  "Tuhanwga",
  "elx.LES",
  "N0isy2K.",
  "Ritzao",
  "syIo-",
  "Sm1ss.FNC",
  "lachybananapeel",
  "Orion",
  "sx.I",
  "Seke.",
  "SKEPTIC-.-",
  "ik.",
  "Yotora",
  "jlaD.Twis",
  "BaaasK",
  "Fleexy.EX",
  "TungTung.C9",
  "s3nt",
  "Goo.GODSENT",
  "KungFuAres-",
  "iXizl",
  "Glo.GODSENT",
  "RimaHassan",
  "whatahella",
  "IVX",
  "xunai",
  "Embure_Rise",
  "odav",
  "AidenKEKE",
  "Dream.SSG",
  "Vaip",
  "xez.SK",
  "Madonna.-",
  "fpi",
  "EunSang.BFX",
  "into_the_force",
  "aos",
  "Skaters.",
  "ShadowVex-",
  "Endux-iwnl",
  "Xina.NM",
  "Csensy247",
  "autoaim",
  "tre1ko",
  "phoenix",
  "Jovo7",
  "crook.SK",
  "Gity.SSG",
  "LBorgesJr",
  "sbx",
  "RazaH.Liquid",
  "Faide.SECRET",
  "auntsteph",
  "Cxt1",
  "PingWIN.69",
  "Mirney007",
  "Mew",
  "Rhqnz",
  "B_aT_M_aN",
  "HATES88",
  "maafia",
  "Campo",
  "SheMightBe13",
  "gaIores",
  "M4SOPMOD-Il",
  "Xuvei.",
  "AIyssaLiu",
  "oChu",
  "JirkeZzzz",
  "ZakKilla",
  "RattIed",
  "Inazkii",
  "Wristbands",
  "vxvt",
  "Atom.100T",
  "nukeszao.",
  "GMZ.100T",
  "Squiisjy",
  "BIayde",
  "vlongchamp.007",
  "discgg.glaciers",
  "Escololoo",
  "Krinitx",
  "Dtains",
  "KJH",
  "Misa.BFX",
  "Soldier.BFX",
  "Kira.-69",
  "Champ.AVN",
  "Bluebrird",
  "peekzao",
  "Lambe",
  "FIowERA",
  "Blunt",
  "Dxni",
  "Hakase._.",
  "Reaz.HERETICS",
  "Salsalino",
  "Bmzyy",
  "Nyulu",
  "Mike.SS",
  "Sogen..",
  "Kazi.WiM",
  "juicier",
  "aay1K",
  "Eupor.Geekay",
  "Hxsky.-",
  "Pengujn-San",
  "Zyplo.",
  "Skedar.",
  "scriptingchud",
  "milker",
  "Mp4__",
  "KKaizyn",
  "pgzap-",
  "Hash.CU",
  "FlickyChally",
  "WRMdog",
  "StopFlo",
  "Sleqt-Arial",
  "Fairhs",
  "Marto.Rebels",
  "Sarks.Geekay",
  "lsonade.",
  "PSG-LGD-xNova",
  "MukiBetts",
  "FjlloZ-",
  "RORICK.VP",
  "xYello",
  "rquj",
  "Cheatz.",
  "laqkn",
  "SlyHeh.",
  "spdr",
  "G34",
  "Lavezi.",
  "Sailor.Lost",
  "curs",
  "AFu.Impart",
  "pbrRAW",
  "KAF",
  "NE0NNNNNNNNNNNN",
  "IAreNoodle.",
  "heqq",
  "CHAMPBONKAI",
  "King_Phreak97",
  "MontyJay",
  "b40x",
  "H.ybrid",
  "saiq.",
  "Awaken.Vitality",
  "Chkn3",
  "Jxssim.RAF",
  "SpiriTz.100T",
  "DEDEZAO.TLAW",
  "MkH..",
  "kynvx",
  "ducavstt",
  "avsro",
  "Huntr.",
  "SHUCKZyt",
  "Dodez.FX",
  "KixaGN",
  "casshh.",
  "Rinnzera-Kun",
  "vntz",
  "GAMEPRO1223",
  "Husky.-",
  "CuervoFED",
  "bhu.",
  "CroNxqq",
  "nartiik",
  "BSB769DOIS",
  "TheL3BON",
  "Della.G2",
];

async function main() {
  const baseUrl = Bun.argv[2] || Bun.env.ENGINE_URL || "http://127.0.0.1:50051";
  console.log(`Engine URL: ${baseUrl}\n`);

  // try {
  //   const h = await health(baseUrl);
  //   console.log("GET /health  →", h.status, h.body);
  // } catch (e) {
  //   console.log("GET /health  →", (e as Error).message);
  // }

  // try {
  //   const r = await ready(baseUrl);
  //   console.log("GET /ready  →", r.status, r.body);
  // } catch (e) {
  //   console.log("GET /ready  →", (e as Error).message);
  // }

  // console.log("\n--- IdentityService ---");

  // try {
  //   const link = await linkAccount(baseUrl, {
  //     discordUserId: "123456789",
  //     game: GAME_R6,
  //     username: "Pengu",
  //     platform: "pc",
  //   });
  //   console.log("LinkAccount:", JSON.stringify(link, null, 2));
  // } catch (e) {
  //   console.log("LinkAccount:", (e as Error).message);
  // }

  // try {
  //   const lu = await lookupByDiscord(baseUrl, {
  //     discordUserId: "123456789",
  //     game: GAME_R6,
  //   });
  //   console.log("LookupByDiscord:", JSON.stringify(lu, null, 2));
  // } catch (e) {
  //   console.log("LookupByDiscord:", (e as Error).message);
  // }

  // try {
  //   const lu = await lookupByUsername(baseUrl, {
  //     game: GAME_R6,
  //     username: "Shaiiko",
  //     platform: "pc",
  //   });
  //   console.log("LookupByUsername:", JSON.stringify(lu, null, 2));
  // } catch (e) {
  //   console.log("LookupByUsername:", (e as Error).message);
  // }

  // try {
  //   const unlink = await unlinkAccount(baseUrl, {
  //     discordUserId: "123456789",
  //     game: GAME_R6,
  //   });
  //   console.log("UnlinkAccount:", JSON.stringify(unlink, null, 2));
  // } catch (e) {
  //   console.log("UnlinkAccount:", (e as Error).message);
  // }

  // console.log("\n--- GuildSettingsService ---");

  // try {
  //   const gs = await getGuildSettings(baseUrl, {
  //     guildId: "guild_123",
  //     game: GAME_R6,
  //   });
  //   console.log("GetGuildSettings:", JSON.stringify(gs, null, 2));
  // } catch (e) {
  //   console.log("GetGuildSettings:", (e as Error).message);
  // }

  // try {
  //   const upsert = await upsertGuildSettings(baseUrl, {
  //     settings: {
  //       guildId: "guild_123",
  //       game: GAME_R6,
  //       defaultTeamFormat: "5v5",
  //       autoBalance: true,
  //       crossGuildMatchmaking: false,
  //       updatedAtMs: Date.now(),
  //       updatedByDiscordUserId: "123456789",
  //     },
  //   });
  //   console.log("UpsertGuildSettings:", JSON.stringify(upsert, null, 2));
  // } catch (e) {
  //   console.log("UpsertGuildSettings:", (e as Error).message);
  // }

  // try {
  //   const mr = await getMatchmakingRules(baseUrl, {
  //     guildId: "guild_123",
  //     game: GAME_R6,
  //   });
  //   console.log("GetMatchmakingRules:", JSON.stringify(mr, null, 2));
  // } catch (e) {
  //   console.log("GetMatchmakingRules:", (e as Error).message);
  // }

  // try {
  //   const upsert = await upsertMatchmakingRules(baseUrl, {
  //     rules: {
  //       guildId: "guild_123",
  //       game: GAME_R6,
  //       minElo: 800,
  //       maxElo: 2000,
  //       platforms: ["pc"],
  //       requireVerified: false,
  //       maxEloGap: 500,
  //       updatedAtMs: Date.now(),
  //     },
  //   });
  //   console.log("UpsertMatchmakingRules:", JSON.stringify(upsert, null, 2));
  // } catch (e) {
  //   console.log("UpsertMatchmakingRules:", (e as Error).message);
  // }

  // try {
  //   const ns = await getNotificationSettings(baseUrl, {
  //     guildId: "guild_123",
  //     game: GAME_R6,
  //   });
  //   console.log("GetNotificationSettings:", JSON.stringify(ns, null, 2));
  // } catch (e) {
  //   console.log("GetNotificationSettings:", (e as Error).message);
  // }

  // try {
  //   const upsert = await upsertNotificationSettings(baseUrl, {
  //     settings: {
  //       guildId: "guild_123",
  //       game: GAME_R6,
  //       matchResultsChannel: "channel_456",
  //       tournamentAnnouncementsChannel: "channel_789",
  //       leaderboardUpdatesEnabled: true,
  //       updatedAtMs: Date.now(),
  //     },
  //   });
  //   console.log("UpsertNotificationSettings:", JSON.stringify(upsert, null, 2));
  // } catch (e) {
  //   console.log("UpsertNotificationSettings:", (e as Error).message);
  // }

  // try {
  //   const mq = await getMatchQuotas(baseUrl, {
  //     guildId: "guild_123",
  //     game: GAME_R6,
  //   });
  //   console.log("GetMatchQuotas:", JSON.stringify(mq, null, 2));
  // } catch (e) {
  //   console.log("GetMatchQuotas:", (e as Error).message);
  // }

  // try {
  //   const upsert = await upsertMatchQuotas(baseUrl, {
  //     quota: {
  //       guildId: "guild_123",
  //       game: GAME_R6,
  //       dailyMatchLimit: 10,
  //       updatedByDiscordUserId: "123456789",
  //       updatedAtMs: Date.now(),
  //     },
  //   });
  //   console.log("UpsertMatchQuotas:", JSON.stringify(upsert, null, 2));
  // } catch (e) {
  //   console.log("UpsertMatchQuotas:", (e as Error).message);
  // }

  // console.log("\n--- StatsService ---");

  // // Fetch stats for a single known player (detailed output)
  // try {
  //   const stats = await fetchStats(baseUrl, {
  //     username: "Shaiiko",
  //     platform: PLATFORM_AUTO,
  //     game: GAME_R6,
  //   });
  //   console.log("FetchStats (Shaiiko):", JSON.stringify(stats, null, 2));
  // } catch (e) {
  //   console.log("FetchStats (Shaiiko):", (e as Error).message);
  // }

  // try {
  //   const coll = await fetchStatsCollection(baseUrl, {
  //     username: "Shaiiko",
  //     platform: PLATFORM_AUTO,
  //     game: GAME_R6,
  //   });
  //   console.log("FetchStatsCollection (Shaiiko):", JSON.stringify(coll, null, 2));
  // } catch (e) {
  //   console.log("FetchStatsCollection (Shaiiko):", (e as Error).message);
  // }

  // console.log("\n--- LeaderboardService ---");

  // try {
  //   const lb = await getLeaderboard(baseUrl, {
  //     game: GAME_R6,
  //     guildId: "guild_123",
  //     type: LEADERBOARD_ELO,
  //     limit: 10,
  //     offset: 0,
  //   });
  //   console.log("GetLeaderboard:", JSON.stringify(lb, null, 2));
  // } catch (e) {
  //   console.log("GetLeaderboard:", (e as Error).message);
  // }

  // try {
  //   const pr = await getPlayerRank(baseUrl, {
  //     game: GAME_R6,
  //     guildId: "guild_123",
  //     playerId: "42",
  //     type: LEADERBOARD_ELO,
  //   });
  //   console.log("GetPlayerRank:", JSON.stringify(pr, null, 2));
  // } catch (e) {
  //   console.log("GetPlayerRank:", (e as Error).message);
  // }

  console.log(`\n--- Fetching stats for ${TOP_PLAYERS.length} top R6 players ---`);

  const CONCURRENCY = 70;
  let success = 0;
  let fail = 0;
  const start = performance.now();

  async function fetchOne(username: string): Promise<void> {
    try {
      const stats = await fetchStats(baseUrl, {
        username,
        platform: PLATFORM_AUTO,
        game: GAME_R6,
      });
      if (stats.success) {
        success++;
        const s = stats.stats as Record<string, unknown> | undefined;
        const ranked = (s as Record<string, unknown> | undefined)?.rankedStats as
          | Record<string, unknown>
          | undefined;
        console.log(
          `  OK  ${username.padEnd(20)} RP=${ranked?.rankPoints ?? "?"}  WL=${ranked?.wins ?? "?"}-${ranked?.losses ?? "?"}`,
        );
      } else {
        fail++;
        console.log(`  ERR ${username.padEnd(20)} ${stats.error?.code ?? "unknown"}`);
      }
    } catch (e) {
      fail++;
      const msg = (e as Error).message.slice(0, 60);
      console.log(`  ERR ${username.padEnd(20)} ${msg}`);
    }
  }

  for (let i = 0; i < TOP_PLAYERS.length; i += CONCURRENCY) {
    const chunk = TOP_PLAYERS.slice(i, i + CONCURRENCY);
    await Promise.allSettled(chunk.map((u) => fetchOne(u)));
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  console.log(`\nDone. ${success} OK, ${fail} failed out of ${TOP_PLAYERS.length} in ${elapsed}s`);
}

main();
