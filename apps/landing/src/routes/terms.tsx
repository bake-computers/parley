import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { TermsContentEn } from "#/content/terms.en";
import { useMessages } from "#/lib/content/messages/use-messages";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  const m = useMessages();
  const lp = m.legalPages;

  return (
    <LegalPage label={lp.termsLabel} title={lp.termsTitle} lastUpdated={lp.termsUpdated}>
      <TermsContentEn />
    </LegalPage>
  );
}