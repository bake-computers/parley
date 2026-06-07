import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";

export const Route = createFileRoute("/privacy")({ component: PrivacyPage });

function PrivacyPage() {
  return (
    <LegalPage label="Privacy" title="Privacy Policy" lastUpdated="June 7, 2026">
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">1. Introduction</h2>
        <p>
          Parley (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to
          protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and
          safeguard your information when you use our Discord application, website, and related
          matchmaking services (collectively, the &ldquo;Service&rdquo;). Because our primary
          database infrastructure is hosted in the European Union (Amsterdam), we align our data
          practices with the principles of the General Data Protection Regulation (GDPR).
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">2. Information We Collect</h2>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.1 Discord and Profile Data
        </h3>
        <p>
          We do not collect traditional credentials like emails or passwords. Instead, we collect
          identifiers required to operate the Service via Discord OAuth. This includes your Discord
          User ID, platform usernames (e.g., PC, PlayStation, Xbox), Discord server (Guild)
          memberships, and tournament participation history.
        </p>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.2 Game Telemetry and Matchmaking Data
        </h3>
        <p>
          To power our skill-based matchmaking, bracket generation, and auto-balancing systems, we
          store specific telemetry tied to your profile for supported games (such as Rainbow Six
          Siege and Brawl Stars). This includes:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            External statistics (Rank points, K/D ratio, KOST, headshot percentages, win rates).
          </li>
          <li>
            Internal platform metrics (Parley ELO, internal win/loss records, balance ratings).
          </li>
          <li>
            Match history timestamps and specific in-match performance data (kills, deaths, seeds).
          </li>
        </ul>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.3 Infrastructure and Automatically Collected Information
        </h3>
        <p>
          When you interact with our bot or website, requests are processed through Cloudflare
          Workers. During this routing, standard network data such as IP addresses, browser types,
          and interaction timestamps are temporarily processed at edge nodes for security, caching,
          and abuse prevention.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          3. How We Use Your Information
        </h2>
        <p>We use your data exclusively to operate and improve Parley:</p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <strong>Matchmaking:</strong> Calculating seed scores and balance gaps to generate fair
            team distributions.
          </li>
          <li>
            <strong>Tournament Operations:</strong> Managing team rosters, bracket progression, and
            enforcing guild-specific matchmaking limits (quotas, ELO caps).
          </li>
          <li>
            <strong>Service Delivery:</strong> Sending automated match results and tournament
            announcements directly to your Discord channels.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          4. Data Storage and Sub-Processors
        </h2>
        <p>
          Your persistent data is stored on heavily secured database infrastructure hosted by
          24fire.de, located in Amsterdam, Netherlands. We do not sell your personal data. We
          utilize the following sub-processors strictly to keep the Service online:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <span className="font-medium text-foreground/80">Cloudflare:</span> For edge computing
            (Workers), DNS routing, and DDoS protection.
          </li>
          <li>
            <span className="font-medium text-foreground/80">24fire.de:</span> For primary database
            hosting within the European Union.
          </li>
          <li>
            <span className="font-medium text-foreground/80">Discord:</span> For user authentication
            and message delivery.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          5. Data Retention and Anonymization
        </h2>
        <p>
          We retain your data for as long as you actively use Parley. Transient data, such as active
          matchmaking queues, expires automatically. If you request account deletion, we will purge
          your personal identifiers (Discord User ID, external platform usernames). However, to
          preserve the integrity of historical tournament brackets and guild match history, your
          past match performances will be retained but fully anonymized and decoupled from your
          identity.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">6. Security</h2>
        <p>
          We implement rigorous technical measures to protect your data, relying on modern
          encryption in transit (TLS) and strict access controls to our Amsterdam servers. While we
          take every reasonable precaution to secure our database queries and API endpoints, no
          electronic transmission is completely infallible.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">7. Children&rsquo;s Privacy</h2>
        <p>
          The Service is not intended for individuals under the age of 13 (or the minimum age of
          digital consent in your jurisdiction, such as 16 in certain EU countries). We do not
          knowingly collect data from children. If we discover a user is under age, we will
          immediately delete their profile data.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">8. Your GDPR Rights</h2>
        <p>
          Because we operate servers in the EU, you have definitive rights regarding your personal
          data regardless of your location:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <strong>Access:</strong> Request a copy of the player profile and matchmaking data we
            hold.
          </li>
          <li>
            <strong>Rectification:</strong> Correct inaccurate Discord associations or internal
            tracking.
          </li>
          <li>
            <strong>Erasure:</strong> Request the anonymization of your data (&ldquo;Right to be
            Forgotten&rdquo;).
          </li>
          <li>
            <strong>Portability:</strong> Receive your stored JSON telemetry payloads in a readable
            format.
          </li>
        </ul>
        <p className="mt-2">
          To exercise any of these rights, please contact us via the instructions in our{" "}
          <a
            href="/legal-notice"
            className="underline underline-offset-4 transition-colors hover:text-[#c0c5ce]"
          >
            Legal Notice
          </a>
          . We will process your request within 30 days.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy as we add support for new games or alter our matchmaking
          algorithms. Material changes to how we handle your telemetry or Discord data will be
          announced via our bot in your Discord server before taking effect.
        </p>
      </section>

      <div className="mt-14! border-t border-border/60 pt-6">
        <p className="text-xs text-muted-foreground/60">
          This document was last updated on June 7, 2026. It is effective as of that date and
          supersedes all prior versions.
        </p>
      </div>
    </LegalPage>
  );
}
