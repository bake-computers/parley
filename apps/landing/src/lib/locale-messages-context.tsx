import { createContext, useContext } from "react";
import type { Locale } from "#/lib/i18n";
import { messagesEn } from "#/lib/i18n-messages.en";
import type { Messages } from "#/lib/i18n-messages.types";

type LocaleMessagesValue = { locale: Locale; m: Messages };

const LocaleMessagesContext = createContext<LocaleMessagesValue | null>(null);

export function LocaleMessagesProvider({
  locale,
  m,
  children,
}: {
  locale: Locale;
  m: Messages;
  children: React.ReactNode;
}) {
  return (
    <LocaleMessagesContext.Provider value={{ locale, m }}>{children}</LocaleMessagesContext.Provider>
  );
}

/** English catalog only — for routes outside `/$locale` (e.g. match detail). */
export function useLocale(): LocaleMessagesValue {
  const ctx = useContext(LocaleMessagesContext);
  if (ctx) {
    return ctx;
  }
  return { locale: "en", m: messagesEn };
}