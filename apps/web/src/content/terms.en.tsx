import { LegalDocFooter } from "#/components/LegalDocFooter";
import { LegalNoticeInlineLink } from "#/components/LegalNoticeInlineLink";

export function TermsContentEn() {
  return (
    <>
      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">1. Acceptance of Terms</h2>
        <p>
          By accessing or using Parley (&ldquo;the Service&rdquo;), you agree to be bound by these
          Terms of Service (&ldquo;Terms&rdquo;). If you do not agree to these Terms, you may not
          access or use the Service. These Terms constitute a legally binding agreement between you
          and Parley. The Service is provided as a Discord application and companion website for
          competitive matchmaking and tournament operations.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          2. Eligibility and Age Requirements
        </h2>
        <p>
          To use the Service, you must be at least 16 years of age, or the minimum age of digital
          consent in your respective country, whichever is higher. If you are under the age of 18
          but meet the minimum digital consent age, you must have the explicit permission of a
          parent or legal guardian to use the Service. We reserve the right to terminate accounts
          that are found to be in violation of these age restrictions.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          3. User Accounts and Discord Integration
        </h2>
        <p>
          Parley operates via integration with Discord. By linking your account, you authorize us to
          process specific data as outlined in our Privacy Policy. You are solely responsible for
          maintaining the security of your Discord account. Parley retains the right to suspend or
          terminate your access to the Service if we detect unauthorized access, automation, or
          abuse originating from your linked identity.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          4. Acceptable Use and Fair Play
        </h2>
        <p>You agree to use the Service strictly for fair competitive play. You agree not to:</p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>
            Manipulate matchmaking algorithms, artificially inflate ELO/rankings, or engage in
            "smurfing" to bypass skill brackets.
          </li>
          <li>
            Exploit the platform using automated scripts, bots, or undocumented API requests outside
            of standard Discord interaction.
          </li>
          <li>
            Harass, threaten, or doxx other players, or distribute malicious content within
            Parley-generated channels.
          </li>
          <li>
            Attempt to reverse-engineer our backend systems or access database infrastructure.
          </li>
        </ul>
        <p className="mt-3">
          Violation of these rules will result in an immediate, unappealable ban from the Service
          across all integrated Guilds.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          5. Intellectual Property Rights
        </h2>
        <p>
          The Service, including the Parley brand, matchmaking algorithms, database schemas, and
          custom code, are the intellectual property of Parley and its developers. You may not
          reproduce, distribute, or create derivative works without prior written consent.
        </p>
        <p className="mt-3">
          Rainbow Six Siege, Ubisoft, and related marks are trademarks of Ubisoft Entertainment.
          Discord is a trademark of Discord Inc. Parley is an independent tool and is not affiliated
          with, endorsed by, or sponsored by Ubisoft or Discord. All game telemetry and statistics
          remain the property of their respective owners.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">6. Limitation of Liability</h2>
        <p>
          Parley is provided free of charge during its pre-launch and developmental phases. We are
          liable without limitation for damages caused by intent (Vorsatz) or gross negligence
          (grobe Fahrlässigkeit), as well as for damages resulting from injury to life, body, or
          health.
        </p>
        <p className="mt-3">
          For slight negligence (leichte Fahrlässigkeit), we are only liable if essential
          contractual obligations (Kardinalpflichten) are breached. In such cases, our liability is
          limited to the foreseeable, contract-typical damage. We assume no liability for lost
          tournament winnings, server downtime, matchmaking inaccuracies, or data loss beyond the
          scope of local statutory requirements.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          7. Modification and Termination of Service
        </h2>
        <p>
          As an actively developed platform, Parley may undergo frequent updates, feature removals,
          or database resets. We reserve the right to modify, suspend, or discontinue the Service
          (or any part thereof) at any time, with or without notice. We are not liable to you or any
          third party for any modification or cessation of the Service.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          8. Governing Law and Jurisdiction
        </h2>
        <p>
          These Terms and your use of the Service shall be governed by the laws of the Federal
          Republic of Germany, excluding the UN Convention on Contracts for the International Sale
          of Goods (CISG). If you are a consumer residing in the European Union, you also enjoy the
          protection of the mandatory consumer protection provisions of your country of residence.
          The exclusive place of jurisdiction for all disputes arising from these Terms is Hamburg,
          Germany, provided the user is a merchant or legal entity.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">9. Severability</h2>
        <p>
          If any provision of these Terms is deemed invalid or unenforceable under German law, the
          remaining provisions will remain in full force and effect. The invalid provision will be
          replaced by a valid provision that most closely approximates the economic and legal intent
          of the original.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">10. Contact</h2>
        <p>
          For legal inquiries regarding these Terms of Service, please refer to our{" "}
          <LegalNoticeInlineLink /> for official contact information.
        </p>
      </section>

      <LegalDocFooter doc="terms" />
    </>
  );
}
