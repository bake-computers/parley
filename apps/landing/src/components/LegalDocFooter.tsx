import { useLocale } from "#/lib/locale-messages-context";

type Doc = "privacy" | "terms";

export function LegalDocFooter({ doc }: { doc: Doc }) {
  const { locale, m } = useLocale();
  const lp = m.legalPages;
  const text =
    doc === "privacy"
      ? locale === "de"
        ? lp.privacyFooterDe
        : lp.privacyFooterEn
      : locale === "de"
        ? lp.termsFooterDe
        : lp.termsFooterEn;

  return (
    <div className="!mt-14 border-t border-border/60 pt-6">
      <p className="text-xs text-muted-foreground/60">{text}</p>
    </div>
  );
}