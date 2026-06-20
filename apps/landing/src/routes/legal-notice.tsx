import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";

export const Route = createFileRoute("/legal-notice")({ component: LegalNoticePage });

function LegalNoticePage() {
  return (
    <LegalPage label="Legal" title="Legal Notice" lastUpdated="June 7, 2026">
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Impressum gem&auml;&szlig; &sect; 5 DDG
        </h2>
        <div className="space-y-1">
          <p className="font-medium text-foreground/80">Address</p>
          <p>Fabian Schmitt</p>
          <p>Henriette-brey str 41</p>
          <p>47608 Geldern</p>
          <p>Deutschland</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Contact</h2>
        <div className="space-y-1">
          <p>
            <span className="font-medium text-foreground/80">Represented by: </span>
            Fabian Schmitt
          </p>
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
            {/* Under § 5 DDG, a second means of immediate communication is required. */}
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
          <p>Henriette-brey str 41</p>
          <p>47608 Geldern</p>
          <p>Deutschland</p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Online Dispute Resolution (&sect; 36 VSBG)
        </h2>
        <p>
          We are neither obligated nor willing to participate in dispute resolution proceedings
          before a consumer arbitration board pursuant to the German Consumer Dispute Resolution Act
          (VSBG).
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Validity</h2>
        <p>
          This Legal Notice is valid for the following websites, social media accounts, and other
          services: parley.bot, the Discord app account Parley (Bot), and associated services.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Liability for Content</h2>
        <p>
          As a service provider, we are responsible for our own content on these pages in accordance
          with general laws, pursuant to &sect; 7 Abs. 1 DDG. However, according to &sect;&sect; 8
          to 10 DDG, we are not obligated as a service provider to monitor transmitted or stored
          third-party information or to investigate circumstances that indicate illegal activity.
          Obligations to remove or block the use of information under general laws remain
          unaffected.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Liability for Links</h2>
        <p>
          Our Service contains links to external third-party websites, over whose content we have no
          influence. Therefore, we cannot assume any liability for these external contents. The
          respective provider or operator of the pages is always responsible for the content of the
          linked pages. The linked pages were checked for possible legal violations at the time of
          linking, and no illegal content was recognizable. A permanent control of the linked pages
          is unreasonable without concrete evidence of a violation. Upon notification of violations,
          we will remove such links immediately.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Copyright</h2>
        <p>
          The content and works created by the site operators on these pages are subject to German
          copyright law. The reproduction, processing, distribution, and any kind of exploitation
          outside the limits of copyright require the written consent of the respective author or
          creator. Downloads and copies of this site are only permitted for private, non-commercial
          use.
        </p>
      </section>

      <div className="mt-14! border-t border-border/60 pt-6">
        <p className="text-xs text-muted-foreground/60">
          This Legal Notice was last updated on June 7, 2026. It is valid for all digital presences
          operated under the Parley name, including this website, the Discord application, and any
          associated services.
        </p>
      </div>
    </LegalPage>
  );
}
