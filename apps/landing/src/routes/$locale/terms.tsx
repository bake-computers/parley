import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { TermsContentDe } from "#/content/terms.de";
import { TermsContentEn } from "#/content/terms.en";
import { useLocale } from "#/lib/locale-messages-context";

export const Route = createFileRoute("/$locale/terms")({ component: TermsPage });

function TermsPage() {
  const { locale, m } = useLocale();
  const lp = m.legalPages;
  const isDe = locale === "de";

  return (
    <LegalPage label={lp.termsLabel} title={lp.termsTitle} lastUpdated={lp.termsUpdated}>
      {isDe ? <TermsContentDe /> : <TermsContentEn />}
    </LegalPage>
  );
}