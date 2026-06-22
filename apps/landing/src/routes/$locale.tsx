import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";
import { LocaleMessagesProvider } from "#/lib/locale-messages-context";
import { DEFAULT_LOCALE, isLocale, type Locale } from "#/lib/i18n";
import { loadMessages } from "#/lib/load-messages";

export const Route = createFileRoute("/$locale")({
  beforeLoad: ({ params }) => {
    if (!isLocale(params.locale)) {
      throw redirect({ href: `/${DEFAULT_LOCALE}`, replace: true });
    }
    return { locale: params.locale as Locale };
  },
  loader: async ({ params }) => {
    const locale = params.locale as Locale;
    const m = await loadMessages(locale);
    return { locale, m };
  },
  component: LocaleLayout,
});

function LocaleLayout() {
  const { locale, m } = Route.useLoaderData();

  useEffect(() => {
    document.documentElement.lang = m.htmlLang;
  }, [m.htmlLang]);

  return (
    <LocaleMessagesProvider locale={locale} m={m}>
      <Outlet />
    </LocaleMessagesProvider>
  );
}