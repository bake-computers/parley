export const API_BASE_URL = (
  (import.meta.env as Record<string, string | undefined>).VITE_API_BASE_URL ??
  "https://app.parley.bot"
).replace(/\/$/, "");

export function apiUrl(path: string): string {
  if (path.startsWith("http")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${p}`;
}

export function wsUrl(path: string): string {
  if (path.startsWith("ws")) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  return `${wsBase}${p}`;
}
