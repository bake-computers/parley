import { siteHref } from "#/lib/content/paths";
import { useMessages } from "#/lib/content/messages/use-messages";

export function LegalNoticeInlineLink({ children }: { children?: React.ReactNode }) {
  const m = useMessages();
  const label = children ?? `${m.legalPages.legalNoticeTitle} (Impressum)`;
  return (
    <a
      href={siteHref("legal-notice")}
      className="underline underline-offset-4 transition-colors hover:text-accent-silver"
    >
      {label}
    </a>
  );
}