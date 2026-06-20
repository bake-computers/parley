import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { Hero } from "#/components/Hero";
import { Problem } from "#/components/Problem";
import { OurStory } from "#/components/OurStory";
import { SiteFooter } from "#/components/Footer";
import { PageSection, PageSections } from "#/components/ui/page-section";
import { SectionSkeleton } from "#/components/ui/skeleton";

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

function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <PageSections>
          <PageSection id="problem" className="-mt-[min(22vh,12rem)] pt-[min(30vh,16rem)] md:pt-[min(34vh,18rem)]">
            <Problem />
          </PageSection>
          <PageSection id="story">
            <OurStory />
          </PageSection>
          <PageSection id="matchmaking">
            <Suspense fallback={<SectionSkeleton />}>
              <Matchmaking />
            </Suspense>
          </PageSection>
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