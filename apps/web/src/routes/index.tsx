import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { Hero } from "#/components/Hero";
import { SiteFooter } from "#/components/Footer";
import { PageSection, PageSections } from "#/components/ui/page-section";
import { SectionSkeleton } from "#/components/ui/skeleton";
import { publicCache } from "#/lib/http-cache";

const Problem = lazy(() => import("#/components/Problem").then((m) => ({ default: m.Problem })));
const OurStory = lazy(() => import("#/components/OurStory").then((m) => ({ default: m.OurStory })));
const Matchmaking = lazy(() =>
  import("#/components/Matchmaking").then((m) => ({ default: m.Matchmaking })),
);
const Experience = lazy(() =>
  import("#/components/Experience").then((m) => ({ default: m.Experience })),
);
const DiscordCta = lazy(() =>
  import("#/components/CallToAction").then((m) => ({ default: m.DiscordCta })),
);
const Faq = lazy(() => import("#/components/Faq").then((m) => ({ default: m.Faq })));

// Structured data for search engines and AI answer engines. Kept in sync with
// the homepage FAQ copy in lib/content/messages/en.ts.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Parley",
      applicationCategory: "GameApplication",
      operatingSystem: "Discord",
      url: "https://parley.bot/",
      description:
        "Parley is a Rainbow Six Siege Discord bot for fair, skill-matched lobbies, automated scrims, and tournaments. It links Discord identities to in-game accounts, ingests ranked-season telemetry, and balances 5v5 teams with a Composite Performance Rating and Glicko-2.",
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
      featureList: [
        "Telemetry-driven skill matchmaking for Rainbow Six Siege",
        "Glicko-2 and CPR team balancing for fair 5v5 lobbies",
        "Automated scrims and single-elimination tournament brackets",
        "In-Discord stats lookup: K/D, KPR, KOST, headshot %, win rate",
        "Per-server matchmaking rules, rank gates, and quotas",
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: [
        {
          "@type": "Question",
          name: "Is Parley live?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Parley is in open beta on Discord. Join the server, add the bot, and it runs for your community tonight.",
          },
        },
        {
          "@type": "Question",
          name: "How do I use Parley in the beta?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Parley runs as a Discord app. Form teams, run scrims, and join tournaments directly through Discord.",
          },
        },
        {
          "@type": "Question",
          name: "Will there be a web app?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Yes. A full web experience is planned after the Discord beta, with backward compatibility for your Discord setup.",
          },
        },
        {
          "@type": "Question",
          name: "What makes the matchmaking different?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "Parley uses real in-game telemetry: aim, impact, role consistency, and recent form, not just win/loss.",
          },
        },
        {
          "@type": "Question",
          name: "Does it cost anything to join?",
          acceptedAnswer: {
            "@type": "Answer",
            text: "No. The beta is free. Add the bot from the Discord server and you're set.",
          },
        },
      ],
    },
  ],
};

export const Route = createFileRoute("/")({
  // Marketing shell changes rarely; SWR keeps hits after max-age.
  headers: () => publicCache(300, 3600, "page:home"),
  head: () => ({
    links: [{ rel: "canonical", href: "https://parley.bot/" }],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <SiteHeader />
      <main>
        <Hero />
        <PageSections>
          <PageSection
            id="problem"
            className="-mt-[min(22vh,12rem)] pt-[min(30vh,16rem)] md:pt-[min(34vh,18rem)]"
          >
            <Suspense fallback={<SectionSkeleton />}>
              <Problem />
            </Suspense>
          </PageSection>
          <PageSection id="story">
            <Suspense fallback={<SectionSkeleton />}>
              <OurStory />
            </Suspense>
          </PageSection>
          <PageSection id="matchmaking">
            <Suspense fallback={<SectionSkeleton />}>
              <Matchmaking />
            </Suspense>
          </PageSection>
          <section className="px-4 py-12 md:px-6 md:py-20">
            <div className="mx-auto w-full max-w-6xl">
              <Suspense fallback={<SectionSkeleton />}>
                <DiscordCta variant="band" />
              </Suspense>
            </div>
          </section>
          <PageSection id="experience">
            <Suspense fallback={<SectionSkeleton />}>
              <Experience />
            </Suspense>
          </PageSection>
          <PageSection id="discord">
            <Suspense fallback={<SectionSkeleton />}>
              <DiscordCta />
            </Suspense>
          </PageSection>
          <PageSection id="faq">
            <Suspense fallback={<SectionSkeleton />}>
              <Faq />
            </Suspense>
          </PageSection>
        </PageSections>
      </main>
      <SiteFooter />
    </div>
  );
}
