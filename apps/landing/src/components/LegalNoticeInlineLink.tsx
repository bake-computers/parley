import { localizedHref } from "#/lib/i18n";
import { useLocale } from "#/lib/locale-messages-context";

export function LegalNoticeInlineLink({ children }: { children?: React.ReactNode }) {
  const { locale, m } = useLocale();
  const label =
    children ??
    (locale === "de"
      ? m.legalPages.legalNoticeTitle
      : `${m.legalPages.legalNoticeTitle} (Impressum)`);
  return (
    <a
      href={localizedHref(locale, "legal-notice")}
      className="underline underline-offset-4 transition-colors hover:text-accent-silver"
    >
      {label}
    </a>
  );
}