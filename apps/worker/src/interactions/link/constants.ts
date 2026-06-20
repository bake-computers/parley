import { TextInputStyle } from "discord-api-types/v10";

export const PLATFORMS = ["pc", "xbox", "playstation"] as const;

export type Platform = (typeof PLATFORMS)[number];

export const PLATFORM_LABELS: Record<Platform, string> = {
  pc: "PC",
  xbox: "Xbox",
  playstation: "PlayStation",
};

export const PLATFORM_HINTS: Record<Platform, string> = {
  pc: "Ubisoft Connect on PC",
  xbox: "Xbox console or PC Game Pass",
  playstation: "PlayStation console",
};

export const UI_SUCCESS_COLOR = 0x22c55e;
export const UI_ERROR_COLOR = 0xef4444;
export const UI_WARNING_COLOR = 0xf59e0b;
export const UI_MAIN_COLOR = 0x6366f1;

export const GAME_NAME = "Rainbow Six Siege";

/** Discord Components v2 (32768) + Ephemeral (64). */
export const COMPONENTS_V2_EPHEMERAL = 64 | 32768;

export const PLATFORM_SELECT_CUSTOM_ID = "link/platform-select";
export const UNLINK_SELECT_CUSTOM_ID = "link/unlink-select";
export const CONFIRM_SELECT_PREFIX = "link/confirm-select";

export const CONFIRM_ACTION_CONTINUE = "continue";
export const CONFIRM_ACTION_BACK = "back";

/** Modal customId prefix for the username collection step. */
export const USERNAME_MODAL_PREFIX = "link-username-modal";

/** TextInput customId inside the username modal. */
export const USERNAME_INPUT_ID = "link/username-input";

export function confirmSelectCustomId(platform: Platform, username: string): string {
  return `${CONFIRM_SELECT_PREFIX}/${platform}?username=${encodeURIComponent(username)}`;
}

export function usernameModalCustomId(platform: Platform): string {
  return `${USERNAME_MODAL_PREFIX}/${platform}`;
}

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function platformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform];
}

export function normalizePlatform(value: string): Platform | null {
  const lower = value.trim().toLowerCase();
  if (isPlatform(lower)) {
    return lower;
  }
  if (lower === "uplay") {
    return "pc";
  }
  return null;
}

export { TextInputStyle };