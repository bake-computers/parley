import { UI_TOKENS } from "../../ui/tokens.js";

export const SETTINGS_MATCH_RESULTS_PREFIX = "settings/match-results/";
export const SETTINGS_TOURNAMENT_PREFIX = "settings/tournament/";
export const SETTINGS_TOGGLE_PREFIX = "settings/toggle/";
export const SETTINGS_PAGE_PREFIX = "settings/page/";
export const SETTINGS_CANCEL = "settings/cancel";

/** Discord select option values must be 1–100 chars; use this sentinel for "no channel". */
export const SETTINGS_CHANNEL_NONE = "__none__";

export const SETTINGS_PAGE_COUNT = 2;

export function channelIdFromSelectValue(value: string): string {
  return value === SETTINGS_CHANNEL_NONE ? "" : value;
}

export const MANAGE_GUILD_BITFIELD = "32";

export const COLORS = UI_TOKENS;
