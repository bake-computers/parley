/** Stable dependency for settings slices — compares content, not object identity. */
export function settingsBaselineKey(value: unknown): string {
  return JSON.stringify(value);
}
