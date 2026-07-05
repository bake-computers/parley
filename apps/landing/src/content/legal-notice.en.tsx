export function LegalNoticeContentEn() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Impressum gem&auml;&szlig; &sect; 5 Digitale-Dienste-Gesetz (DDG)
        </h2>
        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          Operator of the Service (Diensteanbieter)
        </h3>
        <div className="space-y-1">
          <p>Fabian Schmitt</p>
          <p>Henriette-Brey-Str. 41</p>
          <p>47608 Geldern</p>
          <p>Deutschland</p>
        </div>
        <p className="mt-3">
          We do not accept packages or parcels at this address (Keine Paketannahme).
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Contact</h2>
        <div className="space-y-1">
          <p>
            <span className="font-medium text-foreground/80">Email: </span>
            <a
              href="mailto:contact@parley.bot"
              className="underline underline-offset-4 transition-colors hover:text-accent-silver"
            >
              contact@parley.bot
            </a>
          </p>
          <p>
            <span className="font-medium text-foreground/80">Phone: </span>
            +49 176 41105366
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Responsible for Content (&sect; 18 Abs. 2 MStV)
        </h2>
        <div className="space-y-1">
          <p>Fabian Schmitt</p>
          <p>Henriette-Brey-Str. 41</p>
          <p>47608 Geldern</p>
          <p>Deutschland</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Economic Status</h2>
        <p>
          The Parley Service is currently operated as a non-commercial, free-to-use hobby project.
          No revenue is generated, and therefore no VAT Identification Number
          (Umsatzsteuer-Identifikationsnummer) is required or provided.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Online Dispute Resolution (&sect; 36 VSBG)
        </h2>
        <p>
          We are neither obligated nor willing to participate in dispute resolution proceedings
          before a consumer arbitration board pursuant to the German Consumer Dispute Resolution Act
          (VSBG). The European Commission provides a platform for online dispute resolution (OS),
          which you can find here:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            className="underline underline-offset-4 transition-colors hover:text-accent-silver"
            target="_blank"
            rel="noopener noreferrer"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Validity</h2>
        <p>
          This Legal Notice is valid for all digital presences operated under the Parley name,
          including the website parley.bot, the Discord application &ldquo;Parley (Bot)&rdquo;, and
          any associated official social media accounts.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Liability for Content &amp; Platform Abuse
        </h2>
        <p>
          As a service provider, we are responsible for our own content on these pages in accordance
          with general laws pursuant to &sect; 7 Abs. 1 DDG. According to &sect;&sect; 8 to 10 DDG,
          we are not obligated to monitor transmitted or stored third-party information. However,
          Parley is an active matchmaking platform. We reserve the right to immediately ban users
          and remove content that violates our community guidelines, including cheating, toxicity,
          or abuse, upon gaining knowledge of such activities. Obligations to remove or block the
          use of information under general laws remain unaffected.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Liability for Links</h2>
        <p>
          Our Service contains links to external third-party websites, over whose content we have no
          influence. Therefore, we cannot assume any liability for these external contents. The
          respective provider or operator of the pages is always responsible for the content of the
          linked pages. Upon notification of legal violations, we will remove such links
          immediately.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Copyright</h2>
        <p>
          The code, algorithms, platform design, and works created by the operators of Parley are
          subject to German copyright law. The reproduction, processing, distribution, and any kind
          of exploitation outside the limits of copyright require written consent. Downloads and
          copies of this site are only permitted for private, non-commercial use.
        </p>
      </section>

      <div className="!mt-14 border-t border-border/60 pt-6">
        <p className="text-xs text-muted-foreground/60">
          This document was last updated on June 21, 2026. It is effective as of that date and
          supersedes all prior versions.
        </p>
      </div>
    </>
  );
}
