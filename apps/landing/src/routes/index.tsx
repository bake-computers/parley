import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { Hero } from "#/components/Hero";
import { Problem } from "#/components/Problem";
import { Matchmaking } from "#/components/Matchmaking";
import { Experience } from "#/components/Experience";
import { DiscordCta } from "#/components/CallToAction";
import { Faq } from "#/components/Faq";
import { SiteFooter } from "#/components/Footer";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <Hero />
        <Problem />
        <Matchmaking />
        <Experience />
        <DiscordCta />
        <Faq />
      </main>
      <SiteFooter />
    </div>
  );
}
