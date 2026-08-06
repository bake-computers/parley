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

const warningOrange = staticEmoji("warning_orange", "<:warning_orange:1515457677394837668>");
const trash = staticEmoji("trash", "<:trash:1515457676107317349>");
const trashRed = staticEmoji("trash_red", "<:trash_red:1515457674668675215>");
const timeout = staticEmoji("timeout", "<:timeout:1515457673238282371>");
const time = staticEmoji("time", "<:time:1515457672084848811>");
const reload = staticEmoji("reload", "<:reload:1515457670008541376>");
const redirect = staticEmoji("redirect", "<:redirect:1515457668926541955>");
const pin = staticEmoji("pin", "<:pin:1515457667827503294>");
const linked = staticEmoji("linked", "<:linked:1515457666804219995>");
const global = staticEmoji("global", "<:global:1515457665512243321>");
const calendar = staticEmoji("calendar", "<:calendar:1515457664409272431>");
const banHammer = staticEmoji("ban_hammer", "<:ban_hammer:1515457662987407491>");
const banHammerRed = staticEmoji("ban_hammer_red", "<:ban_hammer_red:1515457661435511085>");
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

export const WarningOrangeEmoji = warningOrange.markup;
export const TrashEmoji = trash.markup;
export const TrashRedEmoji = trashRed.markup;
export const TimeoutEmoji = timeout.markup;
export const TimeEmoji = time.markup;
export const ReloadEmoji = reload.markup;
export const RedirectEmoji = redirect.markup;
export const PinEmoji = pin.markup;
export const LinkedEmoji = linked.markup;
export const GlobalEmoji = global.markup;
export const CalendarEmoji = calendar.markup;
export const BanHammerEmoji = banHammer.markup;
export const BanHammerRedEmoji = banHammerRed.markup;
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
  warning_orange: warningOrange.entry,
  trash: trash.entry,
  trash_red: trashRed.entry,
  timeout: timeout.entry,
  time: time.entry,
  reload: reload.entry,
  redirect: redirect.entry,
  pin: pin.entry,
  linked: linked.entry,
  global: global.entry,
  calendar: calendar.entry,
  ban_hammer: banHammer.entry,
  ban_hammer_red: banHammerRed.entry,
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
