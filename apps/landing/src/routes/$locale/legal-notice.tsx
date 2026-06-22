import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { LegalNoticeContentDe } from "#/content/legal-notice.de";
import { LegalNoticeContentEn } from "#/content/legal-notice.en";
import { useLocale } from "#/lib/locale-messages-context";

export const Route = createFileRoute("/$locale/legal-notice")({ component: LegalNoticePage });

function LegalNoticePage() {
  const { locale, m } = useLocale();
  const lp = m.legalPages;
  const isDe = locale === "de";

  return (
    <LegalPage
      label={lp.legalNoticeLabel}
      title={lp.legalNoticeTitle}
      lastUpdated={lp.legalNoticeUpdated}
    >
      {isDe ? <LegalNoticeContentDe /> : <LegalNoticeContentEn />}
    </LegalPage>
  );
}