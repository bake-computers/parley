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
export const UI_INFO_COLOR = 0xffffff;
export const UI_WARNING_COLOR = 0xf59e0b;

export const GAME_NAME = "Rainbow Six Siege";

export function isPlatform(value: string): value is Platform {
  return (PLATFORMS as readonly string[]).includes(value);
}

export function platformLabel(platform: Platform): string {
  return PLATFORM_LABELS[platform];
}

export function confirmCustomId(platform: Platform, username: string): string {
  const encoded = encodeURIComponent(username);
  const id = `link/confirm/${platform}?username=${encoded}`;
  if (id.length > 100) {
    throw new Error("Username too long for confirmation");
  }
  return id;
}
