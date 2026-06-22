export type { Messages } from "#/lib/i18n-messages.types";
export { messagesEn } from "#/lib/i18n-messages.en";
export { messagesDe } from "#/lib/i18n-messages.de";

import type { Locale } from "#/lib/i18n";
import { messagesEn } from "#/lib/i18n-messages.en";
import { messagesDe } from "#/lib/i18n-messages.de";

/** Sync lookup for SSR / small scripts — loads both catalogs in server bundle only. */
export function messagesFor(locale: Locale) {
  return locale === "de" ? messagesDe : messagesEn;
}