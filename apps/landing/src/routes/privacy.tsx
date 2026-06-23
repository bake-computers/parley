import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { PrivacyContentEn } from "#/content/privacy.en";
import { useMessages } from "#/lib/content/messages/use-messages";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  const m = useMessages();
  const lp = m.legalPages;

  return (
    <LegalPage label={lp.privacyLabel} title={lp.privacyTitle} lastUpdated={lp.privacyUpdated}>
      <PrivacyContentEn />
    </LegalPage>
  );
}