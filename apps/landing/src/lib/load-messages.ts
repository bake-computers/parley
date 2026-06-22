import type { Locale } from "#/lib/i18n";
import type { Messages } from "#/lib/i18n-messages.types";

export async function loadMessages(locale: Locale): Promise<Messages> {
  if (locale === "de") {
    const { messagesDe } = await import("#/lib/i18n-messages.de");
    return messagesDe;
  }
  const { messagesEn } = await import("#/lib/i18n-messages.en");
  return messagesEn;
}