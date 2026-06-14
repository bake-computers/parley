import { createFileRoute } from "@tanstack/react-router";
import { MatchDetailPage } from "#/components/MatchDetailPage";
import { NotFound } from "#/components/NotFound";

export const Route = createFileRoute("/match/$guildId/$uuid")({
  loader: async ({ params }) => {
    // eslint-disable-next-line no-inline-comments
    const env = (await import(/* @vite-ignore */ "cloudflare:workers")).env;
    const { fetchMatchFromCacheOrBridge } = await import("#/lib/match-cache");
    const match = await fetchMatchFromCacheOrBridge(env, params.guildId, params.uuid);
    return { match };
  },
  head: () => ({
    meta: [
      { name: "robots", content: "index,follow" },
      { property: "og:type", content: "website" },
    ],
  }),
  component: MatchRoute,
});

function MatchRoute() {
  const { match } = Route.useLoaderData();

  if (!match) {
    return <NotFound />;
  }

  return <MatchDetailPage match={match} />;
}
