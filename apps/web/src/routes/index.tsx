import { createFileRoute } from "@tanstack/react-router";
import { DiscordCta } from "#/components/CallToAction";
import { Experience } from "#/components/Experience";
import { Faq } from "#/components/Faq";
import { SiteHeader } from "#/components/Header";
import { Hero } from "#/components/Hero";
import { SiteFooter } from "#/components/Footer";
import { Matchmaking } from "#/components/Matchmaking";
import { OurStory } from "#/components/OurStory";
import { Problem } from "#/components/Problem";
import { PageSection, PageSections } from "#/components/ui/page-section";
import { publicCache } from "#/lib/http-cache";

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
    links: [
      { rel: "canonical", href: "https://parley.bot/" },
      // LCP hero image — preloaded only on the home page, not globally.
      {
        rel: "preload",
        href: "/assets/hero/hero-cinematic-768.webp",
        as: "image",
        type: "image/webp",
        fetchPriority: "high",
        media: "(max-width: 767px)",
      },
      {
        rel: "preload",
        href: "/assets/hero/hero-cinematic-1280.webp",
        as: "image",
        type: "image/webp",
        fetchPriority: "high",
        media: "(min-width: 768px)",
      },
    ],
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
            <Problem />
          </PageSection>
          <PageSection id="story">
            <OurStory />
          </PageSection>
          <PageSection id="matchmaking">
            <Matchmaking />
          </PageSection>
          <section className="px-4 py-12 md:px-6 md:py-20">
            <div className="mx-auto w-full max-w-6xl">
              <DiscordCta variant="band" />
            </div>
          </section>
          <PageSection id="experience">
            <Experience />
          </PageSection>
          <PageSection id="discord">
            <DiscordCta />
          </PageSection>
          <PageSection id="faq">
            <Faq />
          </PageSection>
        </PageSections>
      </main>
      <SiteFooter />
    </div>
  );
}
