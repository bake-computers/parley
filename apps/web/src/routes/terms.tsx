import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { TermsContentEn } from "#/content/terms.en";
import { publicCache } from "#/lib/http-cache";
import { useMessages } from "#/lib/content/messages/use-messages";

export const Route = createFileRoute("/terms")({
  headers: () => publicCache(3600, 86400, "page:terms"),
  component: TermsPage,
});

function TermsPage() {
  const m = useMessages();
  const lp = m.legalPages;

  return (
    <LegalPage label={lp.termsLabel} title={lp.termsTitle} lastUpdated={lp.termsUpdated}>
      <TermsContentEn />
    </LegalPage>
  );
}
