import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { HqDashboard } from "#/components/hq-dashboard";
import { getDashboardPageData } from "#/lib/server/dashboard";
import { normalizeDashboardFilters } from "#/lib/dashboard";

const loadDashboardPage = createServerFn({ method: "GET" })
  .inputValidator((input: Record<string, unknown>) => normalizeDashboardFilters(input))
  .handler(async ({ data }) => getDashboardPageData(getRequestHeaders(), data));

export const Route = createFileRoute("/")({
  validateSearch: (search) => normalizeDashboardFilters(search),
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => loadDashboardPage({ data: deps }),
  component: DashboardRoute,
});

function DashboardRoute() {
  return <HqDashboard data={Route.useLoaderData()} />;
}
