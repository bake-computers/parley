import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { PrivacyContentDe } from "#/content/privacy.de";
import { PrivacyContentEn } from "#/content/privacy.en";
import { useLocale } from "#/lib/locale-messages-context";

export const Route = createFileRoute("/$locale/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  const { locale, m } = useLocale();
  const lp = m.legalPages;
  const isDe = locale === "de";

  return (
    <LegalPage label={lp.privacyLabel} title={lp.privacyTitle} lastUpdated={lp.privacyUpdated}>
      {isDe ? <PrivacyContentDe /> : <PrivacyContentEn />}
    </LegalPage>
  );
}