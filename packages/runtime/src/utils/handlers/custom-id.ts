/**
 * Parses a Discord component `custom_id` that follows the convention
 * `prefix/segment1/segment2?key=value`.
 *
 * @param {string} customId - The raw `custom_id` string from the interaction.
 * @param {boolean} onlyPrefix - When `true`, returns only the leading prefix (the part
 *   before the first `/` or `?`). Useful for routing to the correct handler.
 *   When `false` (default), returns the full parsed structure.
 * @returns {string | { path: string[]; params: URLSearchParams }} When `onlyPrefix` is `true`: the prefix string (or the full
 *   `customId` if no delimiter is found). Otherwise: an object with a `path`
 *   array of path segments and a `URLSearchParams` instance for query params.
 *
 * @example
 * ```ts
 * parseCustomId("confirm/order/42?silent=true", true);
 * // → "confirm"
 *
 * parseCustomId("confirm/order/42?silent=true");
 * // → { path: ["confirm", "order", "42"], params: URLSearchParams { silent: "true" } }
 * ```
 */
export function parseCustomId(
  customId: string,
  onlyPrefix = false,
): string | { path: string[]; params: URLSearchParams } {
  if (onlyPrefix) {
    const match = customId.match(/^(.+?)(\/|\?)/iu);
    return match ? (match[1] ?? customId) : customId;
  }

  const [pathValue, paramsValue] = customId.split("?");
  return {
    path: (pathValue ?? "").split("/").filter(Boolean),
    params: new URLSearchParams(paramsValue ?? ""),
  };
}
