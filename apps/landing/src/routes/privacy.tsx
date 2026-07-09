import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { PrivacyContentEn } from "#/content/privacy.en";
import { publicCache } from "#/lib/http-cache";
import { useMessages } from "#/lib/content/messages/use-messages";

export const Route = createFileRoute("/privacy")({
  headers: () => publicCache(3600, 86400, "page:privacy"),
  component: PrivacyPage,
});

function PrivacyPage() {
  const m = useMessages();
  const lp = m.legalPages;

  return (
    <LegalPage label={lp.privacyLabel} title={lp.privacyTitle} lastUpdated={lp.privacyUpdated}>
      <PrivacyContentEn />
    </LegalPage>
  );
}
