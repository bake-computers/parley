/**
 * Bot color system. Graphite silver is the brand accent. Orange warns,
 * red errors. There is no separate success/info color — successful
 * states use the main accent.
 */
export const UI_TOKENS = {
  main: 0xb8b8bd,
  warning: 0xffb020,
  error: 0xff4d4d,
} as const;

export type UiToken = keyof typeof UI_TOKENS;
