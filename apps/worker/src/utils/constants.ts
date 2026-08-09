// Static Discord custom-emoji markup. Discord resolves these in message content
// natively — no application-emoji catalog fetch required.

export const WorldEmoji = "<:world:1535013544775651529>";
export const WarningEmoji = "<:warning:1535013542451740883>";
export const WarningOrangeEmoji = "<:warning_orange:1535013540484616353>";
export const ThumbsUpEmoji = "<:thumbs_up:1535013537691472054>";
export const ThumbsDownEmoji = "<:thumbs_down:1535013534264721591>";
export const SwordEmoji = "<:sword:1535013533165551806>";
export const StreakEmoji = "<:sword:1535013533165551806>";
export const StreakFireEmoji = "<:streak_fire:1535013525921988750>";
export const StarEmoji = "<:star:1535013524718354492>";
export const SearchEmoji = "<:search:1535013523158204446>";
export const MissingEmoji = "<:missing:1535013521098539039>";
export const MissingOrangeEmoji = "<:missing_orange:1535013516455579678>";
export const InformationEmoji = "<:information:1535013514035462234>";
export const DonateEmoji = "<:donate:1535013512818987048>";
export const ConnectionEmoji = "<:connection:1535013511615352862>";
export const ClockEmoji = "<:clock:1535013509971316806>";
export const RankUnspecifiedEmoji = "<:unspecified:1517287561729413250>";
export const RankIronEmoji = "<:iron:1517287557334040757>";
export const RankBronzeEmoji = "<:bronze:1517287550794862766>";
export const RankSilverEmoji = "<:silver:1517287560655798292>";
export const RankGoldEmoji = "<:gold:1517287554691371018>";
export const RankPlatinumEmoji = "<:platinum:1517287559594770523>";
export const RankDiamondEmoji = "<:diamond:1517287553466892388>";
export const RankMasterEmoji = "<:master:1517287558344871967>";
export const RankGrandmasterEmoji = "<:grandmaster:1517287555840606208>";
export const RankChallengerEmoji = "<:challenger:1517287552254738642>";

export const ColorPalette = {
  main: 0xb8b8bd,
  warning: 0xffb020,
  error: 0xff4d4d,
} as const;

export type ColorPalette = keyof typeof ColorPalette;
