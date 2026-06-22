import { LegalDocFooter } from "#/components/LegalDocFooter";
import { LegalNoticeInlineLink } from "#/components/LegalNoticeInlineLink";

export function TermsContentDe() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">1. Annahme der Bedingungen</h2>
        <p>
          Mit Nutzung von Parley akzeptierst du diese Nutzungsbedingungen. Der Dienst umfasst die
          Discord-App und die Website für Matchmaking und Turniere.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">2. Teilnahmeberechtigung</h2>
        <p>
          Mindestalter 16 Jahre bzw. digitales Einwilligungsalter im jeweiligen Land. Unter 18 mit
          Zustimmung der Erziehungsberechtigten.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">3. Discord & Konten</h2>
        <p>
          Gültiges Discord-Konto erforderlich. Parley ist nicht mit Discord Inc. verbunden. Du bist
          für die Sicherheit deines Kontos verantwortlich.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">4. Zulässige Nutzung</h2>
        <p>
          Kein Cheating, Harassment oder Exploits. Wir können Zugang sperren bei Verstößen gegen
          Richtlinien oder Gesetze.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">5. Geistiges Eigentum</h2>
        <p>
          Parley-Code und Design gehören den Betreibern. Rainbow Six Siege ist Markenrecht von
          Ubisoft. Begrenzte Nutzungslizenz wie vorgesehen.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">6. Haftung</h2>
        <p>
          Dienst „wie besehen“, soweit gesetzlich zulässig. Keine Garantie auf permanente
          Verfügbarkeit. Deutsche Rechtsordnung, soweit Verbraucherschutz nicht anderes vorschreibt.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">7. Kontakt</h2>
        <p>
          Rechtliche Anfragen: <LegalNoticeInlineLink />.
        </p>
      </section>
      <LegalDocFooter doc="terms" />
    </>
  );
}
