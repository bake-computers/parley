import { useMessages } from "#/lib/content/messages/use-messages";

type Doc = "privacy" | "terms";

export function LegalDocFooter({ doc }: { doc: Doc }) {
  const m = useMessages();
  const lp = m.legalPages;
  const text = doc === "privacy" ? lp.privacyFooter : lp.termsFooter;

  return (
    <div className="!mt-14 border-t border-border/60 pt-6">
      <p className="text-xs text-muted-foreground/60">{text}</p>
    </div>
  );
}
