import type { CSSProperties } from "react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/** Discord accent_color is 0xRRGGBB integer. Accepts number or #hex string. */
export function toCssColor(color: number | string | undefined | null): string | undefined {
  if (color === null || color === undefined) {
    return undefined;
  }
  if (typeof color === "string") {
    return color;
  }
  return `#${color.toString(16).padStart(6, "0")}`;
}

export function accentStyle(color: number | string | undefined | null): CSSProperties | undefined {
  const css = toCssColor(color);
  if (!css) {
    return undefined;
  }
  return { ["--djs-accent" as string]: css };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} bytes`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const AVATARS: Record<string, string> = {
  blue: "https://cdn.discordapp.com/embed/avatars/0.png",
  gray: "https://cdn.discordapp.com/embed/avatars/1.png",
  green: "https://cdn.discordapp.com/embed/avatars/2.png",
  orange: "https://cdn.discordapp.com/embed/avatars/3.png",
  red: "https://cdn.discordapp.com/embed/avatars/4.png",
  pink: "https://cdn.discordapp.com/embed/avatars/5.png",
};

export function resolveAvatar(avatar?: string): string | undefined {
  if (!avatar) {
    return undefined;
  }
  return AVATARS[avatar] ?? avatar;
}
