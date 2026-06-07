import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";

export const Route = createFileRoute("/legal-notice")({ component: LegalNoticePage });

function LegalNoticePage() {
  return (
    <LegalPage label="Legal" title="Legal Notice" lastUpdated="June 7, 2026">
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Impressum gem&auml;&szlig; &sect; 5 TMG
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
              href="mailto:legal@taren.dev"
              className="underline underline-offset-4 transition-colors hover:text-[#c0c5ce]"
            >
              legal@taren.dev
            </a>
          </p>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          Responsible for Content (&sect; 55 Abs. 2 RStV)
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
          Online Dispute Resolution
        </h2>
        <p>
          The European Commission provides a platform for online dispute resolution (ODR), which you
          can find here:{" "}
          <a
            href="https://ec.europa.eu/consumers/odr/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4 transition-colors hover:text-[#c0c5ce]"
          >
            https://ec.europa.eu/consumers/odr/
          </a>
          . I am neither obligated nor willing to participate in dispute resolution proceedings before
          a consumer arbitration board.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Validity</h2>
        <p>
          This Legal Notice is valid for the following websites, social media accounts and other
          services: parley.bot, the Discord app account Parley (Bot), and associated services.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Liability for Content</h2>
        <p>
          As a service provider, I am responsible for my own content on these pages in accordance
          with general laws, pursuant to &sect; 7 Abs.1 TMG. However, according to &sect;&sect; 8 to
          10 TMG, I am not obligated as a service provider to monitor transmitted or stored
          third-party information or to investigate circumstances that indicate illegal activity.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Liability for Links</h2>
        <p>
          My offering contains links to external third-party websites, over whose content I have no
          influence. Therefore, I cannot assume any liability for these external contents. The
          respective provider or operator of the pages is always responsible for the content of the
          linked pages.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">Copyright</h2>
        <p>
          The content and works created by the site operators on these pages are subject to German
          copyright law. The reproduction, processing, distribution, and any kind of exploitation
          outside the limits of copyright require the written consent of the respective author or
          creator.
        </p>
      </section>

      <div className="!mt-14 border-t border-border/60 pt-6">
        <p className="text-xs text-muted-foreground/60">
          This Legal Notice was last updated on June 7, 2026. It is valid for all digital presences
          operated under the Parley name, including this website, the Discord application, and any
          associated services.
        </p>
      </div>
    </LegalPage>
  );
}
