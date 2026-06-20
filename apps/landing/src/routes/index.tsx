import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { Hero } from "#/components/Hero";
import { Problem } from "#/components/Problem";
import { OurStory } from "#/components/OurStory";
import { Matchmaking } from "#/components/Matchmaking";
import { Experience } from "#/components/Experience";
import { DiscordCta } from "#/components/CallToAction";
import { Faq } from "#/components/Faq";
import { SiteFooter } from "#/components/Footer";
import { StickyStack, StickyStackSection } from "#/components/ui/sticky-stack";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main>
        <Hero />
        <StickyStack>
          <StickyStackSection id="problem" zIndex={1}>
            <Problem />
          </StickyStackSection>
          <StickyStackSection id="story" zIndex={2}>
            <OurStory />
          </StickyStackSection>
          <StickyStackSection id="matchmaking" zIndex={3}>
            <Matchmaking />
          </StickyStackSection>
          <StickyStackSection id="experience" zIndex={4}>
            <Experience />
          </StickyStackSection>
          <StickyStackSection id="discord" zIndex={5}>
            <DiscordCta />
          </StickyStackSection>
          <StickyStackSection id="faq" zIndex={6}>
            <Faq />
          </StickyStackSection>
        </StickyStack>
      </main>
      <SiteFooter />
    </div>
  );
}