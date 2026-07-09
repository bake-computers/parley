import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuthMe } from "#/hooks/useAuthMe";

export const Route = createFileRoute("/tournaments/$code/manage")({ component: ManageTournamentPage });
function ManageTournamentPage() {
  const { code } = Route.useParams();
  const { me } = useAuthMe();
  if (!me) return <main className="p-8"><Link to="/auth/login" search={{ redirect: `/tournaments/${code}/manage` }}>Log in to manage this tournament</Link></main>;
  return <main className="mx-auto max-w-3xl p-8"><h1>Manage tournament {code.toUpperCase()}</h1><p>Review confirmed teams, start manually when ready, or cancel the event.</p><div className="mt-5 flex gap-3"><button className="rounded bg-primary p-2 text-primary-foreground">Start tournament</button><button className="rounded border p-2">Cancel tournament</button></div></main>;
}
