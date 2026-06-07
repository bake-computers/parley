import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "#/components/LegalPage";

export const Route = createFileRoute("/terms")({ component: TermsPage });

function TermsPage() {
  return (
    <LegalPage label="Legal" title="Terms of Service" lastUpdated="June 7, 2026">
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
        <h2 className="mb-3 text-base font-medium text-foreground">2. Eligibility</h2>
        <p>
          You must be at least 13 years of age to use the Service. If you are between 13 and the age
          of majority in your jurisdiction, you must have the consent of a parent or legal guardian.
          By using the Service, you represent and warrant that you meet these eligibility
          requirements. The Service is not directed at children under 13, and we do not knowingly
          collect information from them.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">3. User Accounts and Discord</h2>
        <p>
          The Service operates primarily as a Discord application. By linking your Discord account to
          Parley, you authorize us to access your Discord user ID, username, avatar, and server
          membership information as necessary to provide matchmaking and tournament features. You are
          responsible for maintaining the security of your Discord account and for all activities
          that occur under your account. You agree to notify us immediately of any unauthorized use
          of your account through our{" "}
          <a href="/legal-notice" className="underline underline-offset-4 transition-colors hover:text-[#c0c5ce]">
            contact channels.
          </a>
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">4. Acceptable Use</h2>
        <p>
          You agree to use the Service only for lawful purposes and in accordance with these Terms.
          You agree not to:
        </p>
        <ul className="mt-2 list-inside list-disc space-y-1.5 pl-1">
          <li>Violate any applicable federal, state, local, or international law or regulation.</li>
          <li>Exploit, cheat, manipulate, or interfere with the matchmaking or ranking systems.</li>
          <li>Harass, abuse, threaten, or harm other users or engage in toxic or disruptive behavior.</li>
          <li>Impersonate any person or entity, or falsely state or misrepresent your affiliation.</li>
          <li>Upload or transmit viruses, malware, or any other malicious code.</li>
          <li>Attempt to gain unauthorized access to any part of the Service or its related systems.</li>
          <li>Use the Service for any commercial solicitation or spam purposes without authorization.</li>
          <li>Scrape, data-mine, or extract data from the Service through automated means without permission.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          5. Intellectual Property Rights
        </h2>
        <p>
          The Service and its entire contents, features, and functionality &mdash; including but not
          limited to the Parley name, logo, branding, matchmaking algorithms, software code, design
          elements, and documentation &mdash; are owned by Parley and are protected by copyright,
          trademark, and other intellectual property laws. You may not reproduce, distribute, modify,
          create derivative works of, publicly display, or otherwise exploit any part of the Service
          without our prior written consent.
        </p>
        <p className="mt-3">
          Rainbow Six Siege, Ubisoft, and related marks are trademarks of Ubisoft Entertainment.
          Discord is a trademark of Discord Inc. Parley is not affiliated with, endorsed by, or
          sponsored by Ubisoft or Discord. All third-party trademarks are the property of their
          respective owners.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">6. User Content</h2>
        <p>
          You retain any ownership rights you have in content you submit through the Service. By
          submitting content, you grant Parley a non-exclusive, royalty-free, worldwide license to
          use, reproduce, and display such content solely for the purpose of operating and improving
          the Service. You represent that you have all necessary rights to the content you submit and
          that it does not violate these Terms or any third-party rights.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">7. Third-Party Services</h2>
        <p>
          The Service integrates with Discord and may reference or link to external game APIs,
          statistics platforms, and other third-party services. We do not control and are not
          responsible for the content, privacy policies, or practices of any third-party services.
          Your interactions with third-party services are governed by their respective terms and
          policies.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          8. Disclaimer of Warranties
        </h2>
        <p>
          THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; BASIS,
          WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED
          BY LAW, PARLEY DISCLAIMS ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT
          WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, SECURE, OR FREE OF VIRUSES OR
          OTHER HARMFUL COMPONENTS.
        </p>
        <p className="mt-3">
          Parley is currently in pre-launch. Features described on the website are planned and may
          change prior to release. We make no guarantees regarding launch dates, feature availability,
          or service continuity during the development period.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">9. Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL PARLEY, ITS
          AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY INDIRECT,
          INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT LIMITED TO LOSS
          OF PROFITS, DATA, USE, OR GOODWILL, ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF OR
          INABILITY TO USE THE SERVICE, WHETHER BASED ON WARRANTY, CONTRACT, TORT (INCLUDING
          NEGLIGENCE), OR ANY OTHER LEGAL THEORY, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF
          SUCH DAMAGES.
        </p>
        <p className="mt-3">
          In jurisdictions that do not allow the exclusion or limitation of certain damages, our
          liability shall be limited to the maximum extent permitted by law. In no event shall
          Parley&rsquo;s total aggregate liability to you exceed the amount you have paid us, if any,
          in the twelve months preceding the claim.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">10. Indemnification</h2>
        <p>
          You agree to defend, indemnify, and hold harmless Parley, its affiliates, officers,
          directors, employees, and agents from and against any claims, damages, obligations, losses,
          liabilities, costs, or debt, and expenses (including reasonable attorneys&rsquo; fees)
          arising from: (a) your use of and access to the Service; (b) your violation of any term of
          these Terms; (c) your violation of any third-party right, including without limitation any
          copyright, trademark, or privacy right; or (d) any claim that your content caused damage to
          a third party.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">11. Termination</h2>
        <p>
          We may terminate or suspend your access to the Service immediately, without prior notice or
          liability, for any reason whatsoever, including without limitation if you breach these
          Terms. Upon termination, your right to use the Service will cease immediately. All
          provisions of these Terms which by their nature should survive termination shall survive,
          including ownership provisions, warranty disclaimers, indemnity, and limitations of
          liability.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">12. Governing Law</h2>
        <p>
          These Terms shall be governed by and construed in accordance with the laws of the United
          States and the State of Delaware, without regard to its conflict of law provisions. Any
          dispute arising from or relating to the subject matter of these Terms shall be subject to
          the exclusive jurisdiction of the federal and state courts located in Delaware. Our failure
          to enforce any right or provision of these Terms shall not be considered a waiver of those
          rights.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">
          13. Changes to These Terms
        </h2>
        <p>
          We reserve the right to modify or replace these Terms at any time at our sole discretion.
          When we make material changes, we will provide notice through the Service or via Discord
          before the changes take effect. What constitutes a material change will be determined at our
          sole discretion. Your continued use of the Service after any changes become effective
          constitutes your acceptance of the revised Terms.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">14. Severability</h2>
        <p>
          If any provision of these Terms is held to be invalid, illegal, or unenforceable by a court
          of competent jurisdiction, such provision shall be severed and the remaining provisions
          shall remain in full force and effect, provided that the essential purpose of the Terms is
          preserved.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">15. Entire Agreement</h2>
        <p>
          These Terms, together with our Privacy Policy and any other legal notices published on the
          Service, constitute the entire agreement between you and Parley concerning the Service and
          supersede all prior or contemporaneous communications and proposals, whether electronic,
          oral, or written, relating to the subject matter hereof.
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-base font-medium text-foreground">16. Contact</h2>
        <p>
          For questions about these Terms of Service, please refer to our{" "}
          <a href="/legal-notice" className="underline underline-offset-4 transition-colors hover:text-[#c0c5ce]">
            Legal Notice
          </a>{" "}
          for contact information.
        </p>
      </section>

      <div className="!mt-14 border-t border-border/60 pt-6">
        <p className="text-xs text-muted-foreground/60">
          This document was last updated on June 7, 2026. By continuing to use the Service, you
          acknowledge that you have read, understood, and agree to be bound by these Terms of
          Service. If you do not agree, you must discontinue use of the Service immediately.
        </p>
      </div>
    </LegalPage>
  );
}
