import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { Hero } from "#/components/Hero";
import { Problem } from "#/components/Problem";
import { OurStory } from "#/components/OurStory";
import { SiteFooter } from "#/components/Footer";
import { PageSection, PageSections } from "#/components/ui/page-section";

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

export const Route = createFileRoute("/")({ component: Home });

function SectionFallback() {
  return <div className="min-h-[12rem] animate-pulse rounded-2xl bg-muted/20" aria-hidden="true" />;
}

function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <PageSections>
          <PageSection id="problem" className="pt-12 md:pt-16">
            <Problem />
          </PageSection>
          <PageSection id="story">
            <OurStory />
          </PageSection>
          <PageSection id="matchmaking">
            <Suspense fallback={<SectionFallback />}>
              <Matchmaking />
            </Suspense>
          </PageSection>
          <PageSection id="experience">
            <Suspense fallback={<SectionFallback />}>
              <Experience />
            </Suspense>
          </PageSection>
          <PageSection id="discord">
            <Suspense fallback={<SectionFallback />}>
              <DiscordCta />
            </Suspense>
          </PageSection>
          <PageSection id="faq">
            <Suspense fallback={<SectionFallback />}>
              <Faq />
            </Suspense>
          </PageSection>
        </PageSections>
      </main>
      <SiteFooter />
    </div>
  );
}