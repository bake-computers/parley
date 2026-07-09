import { createFileRoute } from "@tanstack/react-router";
import { MatchDetailPage } from "#/components/MatchDetailPage";
import { NotFound } from "#/components/NotFound";
import { publicCache } from "#/lib/http-cache";
import { getMatchForRoute } from "#/lib/match/server";

export const Route = createFileRoute("/match/$guildId/$uuid")({
  loader: async ({ params }) => {
    const match = await getMatchForRoute({
      data: { guildId: params.guildId, uuid: params.uuid },
    });
    return { match };
  },
  headers: ({ params }) => publicCache(60, 600, `page:match,match:${params.uuid}`),
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
