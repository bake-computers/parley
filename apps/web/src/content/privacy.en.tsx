import { LegalDocFooter } from "#/components/LegalDocFooter";
import { LegalNoticeInlineLink } from "#/components/LegalNoticeInlineLink";

export function PrivacyContentEn() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">1. Introduction</h2>
        <p>
          Parley (&ldquo;we,&rdquo; &ldquo;our,&rdquo; or &ldquo;us&rdquo;) is committed to
          protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and
          safeguard your information when you interact with our Discord matchmaking bot and related
          services (collectively, the &ldquo;Service&rdquo;).
        </p>
        <p className="mt-2">
          This policy documents the deployment of Parley that was previously operated and is kept in
          the public source archive as historical documentation. It records the practices of that
          deployment, not necessarily those of any other deployment of this code. During that
          operation the Service ran from Germany as a non-commercial hobby project, did not sell
          personal data, and aligned its data practices with the General Data Protection Regulation
          (GDPR). Details about the archive and its licensing are in the <LegalNoticeInlineLink />.
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
          strictly necessary scopes (identify and guilds). We collect and store your Discord User
          ID, username, avatar, and server memberships. We do not request, collect, or store your
          email address or passwords.
        </p>
        <p className="mt-2">
          Before you are redirected to Discord, our sign-in page uses{" "}
          <strong>Cloudflare Turnstile</strong> to distinguish legitimate users from automated
          abuse. Turnstile may process technical interaction signals (such as your IP address,
          browser characteristics, and challenge responses) and transmit a one-time verification
          token to our servers. We validate that token with Cloudflare before starting OAuth. We do
          not use Turnstile for advertising or cross-site tracking. Legal basis: Art. 6(1)(f) GDPR
          (legitimate interest in securing authentication and preventing abuse).
        </p>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.2 Matchmaking, Game Stats, and Automated Decisions
        </h3>
        <p>
          To power matchmaking, bracket generation, and auto-balancing, we run an in-house skill and
          team-balance model on our own servers in Munich. The model evaluates skill levels and
          assigns brackets using gameplay telemetry and your internal Parley match history. Model
          artifacts may be stored encrypted on Cloudflare R2 (EU jurisdiction); they are not a
          third-party AI hosting service processing your profile on our behalf.
        </p>
        <p className="mt-2">
          Because Ubisoft does not provide direct public APIs for all necessary metrics, we transmit
          your provided gaming username to <strong>stats.cc</strong>, an independent third-party
          data controller. We use their closed API to retrieve your public Rainbow Six Siege
          statistics (e.g., Rank points, K/D ratio, win rates). We do not share your internal Parley
          match history or rating with <strong>stats.cc</strong>.
        </p>
        <p className="mt-2">
          <strong>Automated Profiling:</strong> Under the GDPR and the EU AI Act, our matchmaking
          constitutes automated profiling. Decisions are based strictly on public performance
          telemetry retrieved from <strong>stats.cc</strong> and your internal Parley match history.
          The model does not use demographic or sensitive personal data.
        </p>

        <h3 className="mt-4 mb-2 text-sm font-medium text-foreground/90">
          2.3 Cookies, Local Storage, and Edge Processing
        </h3>
        <p>
          When you interact with our bot or companion dashboard, requests are processed through
          Cloudflare (including DNS, CDN, Cloudflare Workers, and Workers KV where used for edge
          operational data such as short-lived caching or coordination). During this routing,
          standard network data such as IP addresses, browser types, and interaction timestamps may
          be temporarily processed at edge nodes for security, caching, and abuse prevention. We do
          not use Workers KV as a primary store for user profiles or match history.
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
            <strong>parley_cookie_consent</strong> (local storage): records your cookie notice
            choice so we do not ask again until our policy version changes. Legal basis: Art.
            6(1)(f) GDPR (demonstrating compliance).
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
            <strong>Matchmaking:</strong> Running our in-house skill and balance model on gameplay
            telemetry and your internal Parley match history to evaluate skill levels, assign
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
          <li>
            <strong>Security and Reliability:</strong> Protecting authentication flows, preventing
            abuse, monitoring service health, and restoring from encrypted backups if needed.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          4. Data Storage, Hosting, and Recipients
        </h2>
        <p>
          Persistent Service data (player profiles, linked game identities, match and tournament
          records, and settings) is stored on our application and PostgreSQL infrastructure hosted
          by Contabo in Munich, Germany. Encrypted backups and matchmaking model artifacts are
          stored on Cloudflare R2 with EU jurisdiction enabled. We do not sell your personal data.
          We do not offer paid data access to third parties. We share or expose data only as needed
          to operate the Service, with the following recipients and processors:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            <span className="font-medium text-foreground/80">Contabo:</span> Virtual server hosting
            in Munich, Germany, for the primary application backend and PostgreSQL database
            (infrastructure).
          </li>
          <li>
            <span className="font-medium text-foreground/80">Cloudflare:</span> DNS and domain
            services, CDN, DDoS protection, Cloudflare Workers, Workers KV, Turnstile bot protection
            on our web sign-in page, and R2 object storage (EU jurisdiction) for encrypted backups
            and model artifacts. See{" "}
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
            <span className="font-medium text-foreground/80">Discord:</span> Authentication (OAuth2)
            and delivery of bot interactions, match results, and announcements in Discord. Discord
            processes data under its own terms and privacy policy when you use Discord.
          </li>
          <li>
            <span className="font-medium text-foreground/80">Stats.cc:</span> We transmit your
            gaming username to this independent data controller solely to retrieve your public
            gameplay statistics.
          </li>
          <li>
            <span className="font-medium text-foreground/80">Cloudflare Pipelines / R2:</span>{" "}
            Operational events only (requests, slow or failed database queries, matchmaking
            calculations, and errors), stored in Cloudflare R2. Matchmaking events may include
            Discord user IDs used to calculate the lobby. Used for reliability, not for advertising.
          </li>
          <li>
            <span className="font-medium text-foreground/80">Grafana Cloud:</span> Infrastructure
            metrics only (for example Prometheus metrics for PostgreSQL, the backend, and the
            server). We do not send application logs, traces, or user content to Grafana Cloud. The
            metrics backend we use is located in the United States (US East). Legal basis: Art.
            6(1)(f) GDPR (legitimate interest in operating a reliable Service). Where personal data
            is transferred to the United States, we rely on appropriate safeguards under Chapter V
            GDPR (including the provider&rsquo;s standard contractual clauses / data processing
            terms where applicable).
          </li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          5. Data Retention and Anonymization
        </h2>
        <p>
          We retain your data for as long as you actively use Parley. Transient data expires
          automatically. If you request account deletion, we will purge your personal identifiers
          (Discord User ID, external platform usernames). However, to preserve the integrity of
          historical tournament brackets and guild match history, your past match performances will
          be retained but fully anonymized and decoupled from your identity.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">6. Security</h2>
        <p>
          We implement technical measures to protect your data, including encryption in transit
          (TLS), encrypted backups on R2, and access controls on our Munich servers. While we take
          every reasonable precaution to secure our database queries and API endpoints, no
          electronic transmission or storage system is completely infallible.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          7. Age Requirements and Children&rsquo;s Privacy
        </h2>
        <p>
          Parley relies on Discord&rsquo;s authentication infrastructure. Under Discord&rsquo;s
          Terms of Service and the GDPR, users in Germany must be at least 16 years old to use the
          platform. We do not knowingly collect data from anyone under the applicable age of digital
          consent. By authenticating with Parley via Discord OAuth2, you confirm you meet
          Discord&rsquo;s minimum age requirements for your region. If we are notified that a user
          is under the required age, we will immediately delete their Parley profile data.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">8. Your GDPR Rights</h2>
        <p>
          Because we operate in the EU and utilize automated profiling, you have the following
          rights regarding your personal data:
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
            <strong>Restriction and objection:</strong> Object to processing based on legitimate
            interests, or request restriction where applicable.
          </li>
          <li>
            <strong>Explainability:</strong> Because you are subject to automated matchmaking
            decisions by our in-house model, you have the right to request an explanation of how
            your bracket was determined or request human intervention if you believe the model made
            a significant error.
          </li>
          <li>
            <strong>Complaint:</strong> Lodge a complaint with a supervisory authority. In Germany
            this is typically your state data protection authority (Landesdatenschutzbehörde).
          </li>
        </ul>
        <p className="mt-2">
          The contact details published with this policy are omitted from the archive and are kept
          as historical documentation rather than as a current contact channel. Anyone who hosts a
          fork or another deployment of this code is responsible for publishing their own privacy
          policy and contact details for data subject requests.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">9. Changes to This Policy</h2>
        <p>
          We may update this Privacy Policy as we alter our matchmaking algorithms, hosting layout,
          or third-party processors. Material changes to how we handle your telemetry or Discord
          data will be announced via our bot in your Discord server before taking effect.
        </p>
      </section>

      <LegalDocFooter doc="privacy" />
    </>
  );
}
