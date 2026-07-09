import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";
import { LegalNoticeContentEn } from "#/content/legal-notice.en";
import { publicCache } from "#/lib/http-cache";
import { useMessages } from "#/lib/content/messages/use-messages";

export const Route = createFileRoute("/legal-notice")({
  headers: () => publicCache(3600, 86400, "page:legal-notice"),
  component: LegalNoticePage,
});

function LegalNoticePage() {
  const m = useMessages();
  const lp = m.legalPages;

  return (
    <LegalPage
      label={lp.legalNoticeLabel}
      title={lp.legalNoticeTitle}
      lastUpdated={lp.legalNoticeUpdated}
    >
      <LegalNoticeContentEn />
    </LegalPage>
  );
}
