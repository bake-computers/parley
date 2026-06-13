/**
 * Bot color system. Graphite silver is the brand accent. Orange warns,
 * red errors. There is no separate success/info color — successful
 * states use the main accent.
 */
export const UI_TOKENS = {
  main: 0x8a8a8e,
  warning: 0xf59e0b,
  error: 0xef4444,
} as const;

export type UiToken = keyof typeof UI_TOKENS;
