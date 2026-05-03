import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getMatchHistory } from "#/lib/server/match-history";
import { AuthGuard } from "#/components/auth-guard";

const loadMatchHistory = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getMatchHistory(getRequestHeaders(), data.guildId);
  });

export const Route = createFileRoute("/guild/$guildId/matches")({
  loader: ({ params }) => loadMatchHistory({ data: { guildId: params.guildId } }),
  component: GuildMatchesRoute,
});

function GuildMatchesRoute() {
  const { guildId } = Route.useParams();
  const data = Route.useLoaderData();

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <h1 className="hq-title">Match History</h1>
        <p className="hq-subtitle">Recent matches and results.</p>
        <pre className="mt-4 rounded border border-white/10 bg-depth-2 p-4 text-sm text-white/70">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </AuthGuard>
  );
}
