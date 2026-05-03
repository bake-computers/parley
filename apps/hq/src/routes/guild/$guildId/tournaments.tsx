import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getGuildTournaments } from "#/lib/server/tournaments";
import { AuthGuard } from "#/components/auth-guard";

const loadGuildTournaments = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getGuildTournaments(getRequestHeaders(), data.guildId);
  });

export const Route = createFileRoute("/guild/$guildId/tournaments")({
  loader: ({ params }) => loadGuildTournaments({ data: { guildId: params.guildId } }),
  component: GuildTournamentsRoute,
});

function GuildTournamentsRoute() {
  const { guildId } = Route.useParams();
  const data = Route.useLoaderData();

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <h1 className="hq-title">Tournaments</h1>
        <p className="hq-subtitle">Active and past tournaments.</p>
        <pre className="mt-4 rounded border border-white/10 bg-depth-2 p-4 text-sm text-white/70">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </AuthGuard>
  );
}
