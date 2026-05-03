import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { readDashboardSession } from "#/lib/server/auth";
import { withDb } from "#/lib/server/db";
import { AuthGuard } from "#/components/auth-guard";

const loadMatchRules = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => {
    if (typeof input.guildId !== "string") throw new Error("guildId required");
    return { guildId: input.guildId };
  })
  .handler(async ({ data }) => {
    return withDb(async (db) => {
      const access = await readDashboardSession(db, getRequestHeaders());
      if (access.status !== "authorized") {
        throw new Error("Unauthorized");
      }
      return { guildId: data.guildId, rules: [] as string[] };
    }).catch(() => ({ guildId: data.guildId, rules: [] as string[] }));
  });

export const Route = createFileRoute("/guild/$guildId/rules")({
  loader: ({ params }) => loadMatchRules({ data: { guildId: params.guildId } }),
  component: GuildRulesRoute,
});

function GuildRulesRoute() {
  const { guildId } = Route.useParams();
  const data = Route.useLoaderData();

  return (
    <AuthGuard guildId={guildId}>
      <div className="hq-shell">
        <h1 className="hq-title">Match Rules</h1>
        <p className="hq-subtitle">Server-specific match rules and regulations.</p>
        <pre className="mt-4 rounded border border-white/10 bg-depth-2 p-4 text-sm text-white/70">
          {JSON.stringify(data, null, 2)}
        </pre>
      </div>
    </AuthGuard>
  );
}
