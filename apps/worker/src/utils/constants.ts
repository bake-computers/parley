import type { AppEmojiName, ApplicationEmojiCatalog, ApplicationEmojiEntry } from "@parley/runtime";

type StaticEmoji = {
  readonly markup: string;
  readonly entry: ApplicationEmojiEntry;
};

function staticEmoji(name: AppEmojiName, markup: string): StaticEmoji {
  const match = markup.match(/^<(a?):([^:]+):(\d+)>$/u);
  if (!match) {
    throw new Error(`Invalid static Discord emoji markup for ${name}`);
  }

  const [, animatedMarker, discordName, id] = match;
  if (!discordName || !id) {
    throw new Error(`Invalid static Discord emoji markup for ${name}`);
  }

  return {
    markup,
    entry: {
      id,
      name,
      discordName,
      animated: animatedMarker === "a",
    },
  };
}

const world = staticEmoji("world", "<:world:1535013544775651529>");
const warning = staticEmoji("warning", "<:warning:1535013542451740883>");
const warningOrange = staticEmoji("warning_orange", "<:warning_orange:1535013540484616353>");
const thumbsUp = staticEmoji("thumbs_up", "<:thumbs_up:1535013537691472054>");
const thumbsDown = staticEmoji("thumbs_down", "<:thumbs_down:1535013534264721591>");
const sword = staticEmoji("sword", "<:sword:1535013533165551806>");
const streak = staticEmoji("streak", "<:sword:1535013533165551806>");
const streakFire = staticEmoji("streak_fire", "<:streak_fire:1535013525921988750>");
const star = staticEmoji("star", "<:star:1535013524718354492>");
const search = staticEmoji("search", "<:search:1535013523158204446>");
const missing = staticEmoji("missing", "<:missing:1535013521098539039>");
const missingOrange = staticEmoji("missing_orange", "<:missing_orange:1535013516455579678>");
const information = staticEmoji("information", "<:information:1535013514035462234>");
const donate = staticEmoji("donate", "<:donate:1535013512818987048>");
const connection = staticEmoji("connection", "<:connection:1535013511615352862>");
const clock = staticEmoji("clock", "<:clock:1535013509971316806>");
const rankUnspecified = staticEmoji("rank_unspecified", "<:unspecified:1517287561729413250>");
const rankIron = staticEmoji("rank_iron", "<:iron:1517287557334040757>");
const rankBronze = staticEmoji("rank_bronze", "<:bronze:1517287550794862766>");
const rankSilver = staticEmoji("rank_silver", "<:silver:1517287560655798292>");
const rankGold = staticEmoji("rank_gold", "<:gold:1517287554691371018>");
const rankPlatinum = staticEmoji("rank_platinum", "<:platinum:1517287559594770523>");
const rankDiamond = staticEmoji("rank_diamond", "<:diamond:1517287553466892388>");
const rankMaster = staticEmoji("rank_master", "<:master:1517287558344871967>");
const rankGrandmaster = staticEmoji("rank_grandmaster", "<:grandmaster:1517287555840606208>");
const rankChallenger = staticEmoji("rank_challenger", "<:challenger:1517287552254738642>");

export const WorldEmoji = world.markup;
export const WarningEmoji = warning.markup;
export const WarningOrangeEmoji = warningOrange.markup;
export const ThumbsUpEmoji = thumbsUp.markup;
export const ThumbsDownEmoji = thumbsDown.markup;
export const SwordEmoji = sword.markup;
export const StreakEmoji = streak.markup;
export const StreakFireEmoji = streakFire.markup;
export const StarEmoji = star.markup;
export const SearchEmoji = search.markup;
export const MissingEmoji = missing.markup;
export const MissingOrangeEmoji = missingOrange.markup;
export const InformationEmoji = information.markup;
export const DonateEmoji = donate.markup;
export const ConnectionEmoji = connection.markup;
export const ClockEmoji = clock.markup;
export const RankUnspecifiedEmoji = rankUnspecified.markup;
export const RankIronEmoji = rankIron.markup;
export const RankBronzeEmoji = rankBronze.markup;
export const RankSilverEmoji = rankSilver.markup;
export const RankGoldEmoji = rankGold.markup;
export const RankPlatinumEmoji = rankPlatinum.markup;
export const RankDiamondEmoji = rankDiamond.markup;
export const RankMasterEmoji = rankMaster.markup;
export const RankGrandmasterEmoji = rankGrandmaster.markup;
export const RankChallengerEmoji = rankChallenger.markup;

export const PARLEY_EMOJI_CATALOG = {
  world: world.entry,
  warning: warning.entry,
  warning_orange: warningOrange.entry,
  thumbs_up: thumbsUp.entry,
  thumbs_down: thumbsDown.entry,
  sword: sword.entry,
  streak: streak.entry,
  streak_fire: streakFire.entry,
  star: star.entry,
  search: search.entry,
  missing: missing.entry,
  missing_orange: missingOrange.entry,
  information: information.entry,
  donate: donate.entry,
  connection: connection.entry,
  clock: clock.entry,
  rank_unspecified: rankUnspecified.entry,
  rank_iron: rankIron.entry,
  rank_bronze: rankBronze.entry,
  rank_silver: rankSilver.entry,
  rank_gold: rankGold.entry,
  rank_platinum: rankPlatinum.entry,
  rank_diamond: rankDiamond.entry,
  rank_master: rankMaster.entry,
  rank_grandmaster: rankGrandmaster.entry,
  rank_challenger: rankChallenger.entry,
} satisfies ApplicationEmojiCatalog;

export const ColorPalette = {
  main: 0xb8b8bd,
  warning: 0xffb020,
  error: 0xff4d4d,
} as const;

export type ColorPalette = keyof typeof ColorPalette;
