import { LegalDocFooter } from "#/components/LegalDocFooter";

export function PrivacyContentDe() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">1. Einleitung</h2>
        <p>
          Parley verpflichtet sich zum Schutz deiner Privatsphäre. Diese Datenschutzerklärung
          erläutert, wie wir Daten erheben und verarbeiten, wenn du unseren Discord-Matchmaking-Bot
          und zugehörige Dienste nutzt. Unsere Datenbank-Infrastruktur liegt in der EU (Amsterdam);
          wir orientieren uns an der DSGVO.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">2. Erhobene Daten</h2>
        <p>
          Discord OAuth2 (identify, guilds): User-ID, Name, Avatar, Server-Mitgliedschaften — keine
          E-Mails oder Passwörter. Matchmaking-Telemetrie und Stats über stats.cc und OVI.run.
          Technische Nutzungsdaten (IP, Browser, Bot-Interaktionen) soweit erforderlich.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">3. Zweck und Rechtsgrundlagen</h2>
        <p>
          Bereitstellung von Matchmaking und Turnieren, Skill-Ratings, Missbrauchsprävention,
          Verbesserung des Dienstes. Art. 6 DSGVO: Vertrag, berechtigtes Interesse, Einwilligung wo
          nötig.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">4. Weitergabe</h2>
        <p>
          Kein Verkauf personenbezogener Daten. Weitergabe an EU-Hosting, stats.cc/OVI.run im
          Rahmen des Dienstes sowie bei gesetzlicher Pflicht.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">5. Aufbewahrung & Sicherheit</h2>
        <p>
          Speicherung nur solange nötig. Angemessene technische und organisatorische Maßnahmen.
          Kontakt: contact@parley.bot.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">6. Deine Rechte</h2>
        <p>
          Auskunft, Berichtigung, Löschung, Einschränkung, Übertragbarkeit, Widerspruch,
          Beschwerde bei einer Aufsichtsbehörde — Anfragen an contact@parley.bot.
        </p>
      </section>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">7. Änderungen</h2>
        <p>Wesentliche Änderungen werden über den Bot in deinem Discord-Server angekündigt.</p>
      </section>
      <LegalDocFooter doc="privacy" />
    </>
  );
}
