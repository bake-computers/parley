import { createFileRoute } from "@tanstack/react-router";
import { Hero } from "#/components/hero";
import { HowItWorks } from "#/components/how-it-works";
import { CommunityStats } from "#/components/community-stats";
import { Features } from "#/components/features";
import { DiscordMock } from "#/components/discord-mock";
import { CommandReference } from "#/components/command-reference";
import { Faq } from "#/components/faq";
import { Footer } from "#/components/footer";

export const Route = createFileRoute("/")({
  component: IndexRoute,
});

function IndexRoute() {
  return (
    <main>
      <Hero />
      <HowItWorks />
      <CommunityStats />
      <Features />
      <section className="lp-section">
        <div className="mb-8">
          <p className="lp-label mb-2">Demo</p>
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
            Team Balancing, Visualized
          </h2>
          <p className="text-muted-foreground mt-2 max-w-xl">
            Parley automatically balances teams based on internal ELO, ensuring fair matches every
            time.
          </p>
        </div>
        <DiscordMock />
      </section>
      <CommandReference />
      <Faq />
      <Footer />
    </main>
  );
}
