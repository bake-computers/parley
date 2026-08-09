import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/tournaments/$code")({ component: TournamentLayout });

function TournamentLayout() {
  return <Outlet />;
}
