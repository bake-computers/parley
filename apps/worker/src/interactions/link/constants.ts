import { ButtonStyle, TextInputStyle } from "discord-api-types/v10";

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

export const GAME_NAME = "Rainbow Six Siege";

/** Discord Components v2 (32768) + Ephemeral (64). */
export const COMPONENTS_V2_EPHEMERAL = 64 | 32768;

// ---- Custom IDs -------------------------------------------------------------

/** Hand-rolled cancel/back from any wizard step. */
export const CANCEL_CUSTOM_ID = "link/cancel";

/** Delink the current Discord↔game account binding. */
export const UNLINK_CUSTOM_ID = "link/unlink";

/** Modal customId prefix for the username collection step. */
export const USERNAME_MODAL_PREFIX = "link-username-modal";

/** TextInput customId inside the username modal. */
export const USERNAME_INPUT_ID = "link/username-input";

// ---- Helpers ----------------------------------------------------------------

export function platformCustomId(platform: Platform): string {
  return `link/platform/${platform}`;
}

export function confirmCustomId(platform: Platform, username: string): string {
  return `link/confirm/${platform}?username=${encodeURIComponent(username)}`;
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

// ---- Style re-exports -------------------------------------------------------
// Republishing the enums here keeps every link file from importing
// `discord-api-types` directly. The slash command's "Confirm" button uses
// Success; the cancel button uses Secondary; the platform rows use Primary.

export { ButtonStyle, TextInputStyle };
