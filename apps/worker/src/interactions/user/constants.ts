import { UI_TOKENS } from "#/ui/tokens";

export { ACCEPT_BUTTON as USER_ACCEPT_BUTTON } from "#/interactions/_shared/acceptance";
export const USER_MATCHMAKING_PREFIX = "user/matchmaking/";
export const USER_VISIBILITY_PREFIX = "user/visibility/";
export const USER_TIMEZONE_PREFIX = "user/timezone/";
export const USER_REFRESH_STATS = "user/refresh-stats";
export const USER_DELETE_OPEN = "user/delete/open";
export const USER_DELETE_MODAL = "user-delete-modal";
export const USER_CANCEL = "user/cancel";
export const USER_PAGE_PREFIX = "user/page/";
export const USER_TZ_PAGE_PREFIX = "user/tz-page/";

export const USER_SETTINGS_PAGE_COUNT = 2;
export const USER_TIMEZONES_PER_PAGE = 4;

export const TIMEZONES = [
  { value: "UTC", label: "UTC" },
  { value: "US/Pacific", label: "US · Pacific" },
  { value: "US/Mountain", label: "US · Mountain" },
  { value: "US/Central", label: "US · Central" },
  { value: "US/Eastern", label: "US · Eastern" },
  { value: "Europe/London", label: "Europe · London" },
  { value: "Europe/Berlin", label: "Europe · Berlin" },
  { value: "Europe/Madrid", label: "Europe · Madrid" },
  { value: "Europe/Athens", label: "Europe · Athens" },
  { value: "Asia/Dubai", label: "Asia · Dubai" },
  { value: "Asia/Tokyo", label: "Asia · Tokyo" },
  { value: "Australia/Sydney", label: "Australia · Sydney" },
] as const;

export const COLORS = UI_TOKENS;
