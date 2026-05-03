import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getGuildPlayers } from "#/lib/server/guild-settings";
import { AuthGuard } from "#/components/auth-guard";

const loadGuildPlayers = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return getGuildPlayers(getRequestHeaders(), data.guildId);
  });

export const Route = createFileRoute("/guild/$guildId/players")({
  loader: ({ params }) => loadGuildPlayers({ data: { guildId: params.guildId } }),
  component: GuildPlayersRoute,
});

function GuildPlayersRoute() {
  const { guildId } = Route.useParams();
  const data = Route.useLoaderData();

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <h1 className="hq-title">Players</h1>
        <p className="hq-subtitle">Guild player roster and statistics.</p>
        <pre className="mt-4 rounded border border-white/10 bg-depth-2 p-4 text-sm text-white/70">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </AuthGuard>
  );
}
