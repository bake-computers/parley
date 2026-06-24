import { LegalDocFooter } from "#/components/LegalDocFooter";

export function PrivacyContentEn() {
  return (
    <>
<section>
        <h2 className="mb-3 text-base font-medium text-foreground">1. Introduction</h2>
        <p>
          Parley (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to
          protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and
          safeguard your information when you interact with our Discord matchmaking bot and related
          services (collectively, the &ldquo;Service&rdquo;). Because our primary database
          infrastructure is hosted in the European Union (Amsterdam), we align our data practices
          with the principles of the General Data Protection Regulation (GDPR).
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">2. Information We Collect</h2>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.1 Discord Bot and Web Dashboard Authentication
        </h3>
        <p>
          To allow server administrators to manage Parley and users to view their profiles, we
          utilize Discord OAuth2 authentication. When you log into our web dashboard, we request
          strictly necessary scopes (identify and guilds). We collect and store your Discord User ID,
          username, avatar, and server memberships. We do not request, collect, or store your email
          address or passwords.
        </p>
        <p className="mt-2">
          Before you are redirected to Discord, our sign-in page uses{" "}
          <strong>Cloudflare Turnstile</strong> to distinguish legitimate users from automated abuse.
          Turnstile may process technical interaction signals (such as your IP address, browser
          characteristics, and challenge responses) and transmit a one-time verification token to
          our servers. We validate that token with Cloudflare before starting OAuth. We do not use
          Turnstile for advertising or cross-site tracking. Legal basis: Art. 6(1)(f) GDPR
          (legitimate interest in securing authentication and preventing abuse).
        </p>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.2 Telemetry, AI Matchmaking, and Third-Party Controllers
        </h3>
        <p>
          To power our matchmaking, bracket generation, and auto-balancing, we utilize an artificial
          intelligence model hosted via OVI.run. Our AI analyzes gameplay telemetry to evaluate skill
          levels and assign brackets.
        </p>
        <p className="mt-2">
          Because Ubisoft does not provide direct public APIs for all necessary metrics, we transmit
          your provided gaming username to <strong>stats.cc</strong>, an independent third-party data
          controller. We use their closed API to retrieve your public Rainbow Six Siege statistics
          (e.g., Rank points, K/D ratio, win rates). We do not share your internal Parley match
          history or ELO with <strong>stats.cc</strong>.
        </p>
        <p className="mt-2">
          <strong>Automated Profiling:</strong> Under the GDPR and the EU AI Act, our matchmaking
          constitutes automated profiling. Our AI model bases its decisions strictly on the
          performance telemetry retrieved from <strong>stats.cc</strong> and your internal Parley
          match history. It does not use demographic or sensitive personal data.
        </p>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.3 Cookies, Local Storage, and Edge Processing
        </h3>
        <p>
          When you interact with our bot or companion dashboard, requests are processed through
          Cloudflare Workers. During this routing, standard network data such as IP addresses,
          browser types, and interaction timestamps are temporarily processed at edge nodes for
          security, caching, and abuse prevention.
        </p>
        <p className="mt-2">
          We use only the following cookies and browser storage on our website. We do not use
          third-party marketing, advertising, or analytics cookies.
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <strong>parley_discord_session</strong> (essential cookie): keeps you signed in to the
            web dashboard after Discord OAuth. HttpOnly, SameSite=Lax, duration aligned with the
            Discord access token (typically up to seven days). Legal basis: Art. 6(1)(b) GDPR
            (performance of the service you request).
          </li>
          <li>
            <strong>parley_discord_oauth_state</strong> (essential cookie): short-lived OAuth
            security token during sign-in (about ten minutes). Legal basis: Art. 6(1)(b) GDPR and
            legitimate interest in securing authentication (Art. 6(1)(f) GDPR).
          </li>
          <li>
            <strong>parley-theme</strong> (local storage, optional): remembers your light/dark theme
            preference if you choose &ldquo;Accept all&rdquo; on our cookie notice. Legal basis:
            Art. 6(1)(a) GDPR (consent). If you choose &ldquo;Essential only,&rdquo; we do not
            persist this preference.
          </li>
          <li>
            <strong>parley_cookie_consent</strong> (local storage): records your cookie notice choice
            so we do not ask again until our policy version changes. Legal basis: Art. 6(1)(f) GDPR
            (demonstrating compliance).
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          3. How We Use Your Information
        </h2>
        <p>We use your data exclusively to operate and improve Parley:</p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <strong>Matchmaking:</strong> Processing gameplay telemetry through our AI model (hosted
            via OVI.run) and your internal Parley match history to evaluate skill levels, assign
            brackets, and generate balanced team distributions.
          </li>
          <li>
            <strong>Tournament Operations:</strong> Managing team rosters, bracket progression, and
            enforcing guild-specific matchmaking rules.
          </li>
          <li>
            <strong>Service Delivery:</strong> Sending automated match results and tournament
            announcements directly to your Discord channels.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          4. Data Storage and Third-Party Sharing
        </h2>
        <p>
          Your persistent data is stored on heavily secured database infrastructure hosted by
          24fire.de, located in Amsterdam, Netherlands. We do not sell your personal data. We share
          data only with the following entities to operate the Service:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <span className="font-medium text-foreground/80">Cloudflare:</span> For edge computing,
            DNS routing, DDoS protection, and Turnstile bot protection on our web sign-in page
            (infrastructure and security). See{" "}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              className="underline underline-offset-4 transition-colors hover:text-accent-silver"
              rel="noopener noreferrer"
              target="_blank"
            >
              Cloudflare&rsquo;s Privacy Policy
            </a>
            .
          </li>
          <li>
            <span className="font-medium text-foreground/80">24fire.de:</span> For primary database
            hosting within the European Union (infrastructure).
          </li>
          <li>
            <span className="font-medium text-foreground/80">OVI.run:</span> For processing
            matchmaking telemetry via our AI model (processor).
          </li>
          <li>
            <span className="font-medium text-foreground/80">Stats.cc:</span> We transmit your gaming
            username to this independent data controller solely to retrieve your public gameplay
            statistics.
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
        <h2 className="mb-3 text-base font-medium text-foreground">
          7. Age Requirements and Children&rsquo;s Privacy
        </h2>
        <p>
          Parley relies on Discord&rsquo;s authentication infrastructure. Under Discord&rsquo;s Terms
          of Service and the GDPR, users in Germany must be at least 16 years old to use the
          platform. We do not knowingly collect data from anyone under the applicable age of digital
          consent. By authenticating with Parley via Discord OAuth2, you confirm you meet
          Discord&rsquo;s minimum age requirements for your region. If we are notified that a user
          is under the required age, we will immediately delete their Parley profile data.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">8. Your GDPR Rights</h2>
        <p>
          Because we operate in the EU and utilize automated profiling, you have the following rights
          regarding your personal data:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <strong>Access &amp; Portability:</strong> Request a readable copy of the player profile
            and OAuth2 data we hold.
          </li>
          <li>
            <strong>Rectification:</strong> Correct inaccurate Discord associations.
          </li>
          <li>
            <strong>Erasure:</strong> Request the anonymization of your data (&ldquo;Right to be
            Forgotten&rdquo;).
          </li>
          <li>
            <strong>Explainability:</strong> Because you are subject to automated matchmaking
            decisions by our AI, you have the right to request an explanation of how your bracket was
            determined or request human intervention if you believe the AI made a significant error.
          </li>
        </ul>
        <p className="mt-2">
          To exercise any of these rights, please contact us via the instructions in our{" "}
          <a
            href="/legal-notice"
            className="underline underline-offset-4 transition-colors hover:text-accent-silver"
          >
            Legal Notice
          </a>
          . We will process your request within 30 days.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy as we alter our matchmaking algorithms or integrate new
          third-party data sources. Material changes to how we handle your telemetry or Discord data
          will be announced via our bot in your Discord server before taking effect.
        </p>
      </section>

      <LegalDocFooter doc="privacy" />
    </>
  );
}
