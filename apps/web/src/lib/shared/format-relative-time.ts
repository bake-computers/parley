import type { Messages } from "#/lib/content/messages";

export function formatRelativeTime(epochMs: number, m: Messages["match"]): string {
  const seconds = Math.floor((Date.now() - epochMs) / 1000);
  if (seconds < 60) {
    return m.relativeJustNow;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}${m.relativeMinutes}`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}${m.relativeHours}`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days}${m.relativeDays}`;
  }
  const months = Math.floor(days / 30);
  return `${months}${m.relativeMonths}`;
}

export function formatUpdatedAt(timestamp: number, prefix: string): string {
  if (timestamp <= 0) {
    return "—";
  }
  const time = new Date(timestamp).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${prefix} ${time}`;
}
