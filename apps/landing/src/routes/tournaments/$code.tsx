import { createFileRoute, Link } from "@tanstack/react-router";
import { useAuthMe } from "#/hooks/useAuthMe";

export const Route = createFileRoute("/tournaments/$code")({ component: TournamentPage });
function TournamentPage() {
  const { code } = Route.useParams();
  const { me } = useAuthMe();
  return <main className="mx-auto max-w-3xl p-8"><h1>Tournament {code.toUpperCase()}</h1><p className="text-muted-foreground">Tournament details, teams, and the live bracket appear here.</p>
    {!me ? <Link to="/auth/login" search={{ redirect: `/tournaments/${code}` }}>Log in with Discord to register</Link> : <section className="mt-6"><h2>Join your team</h2><p>Create a team or select an open named team with your teammates. Registration is limited to members of the host server.</p><button className="mt-3 rounded bg-primary p-2 text-primary-foreground">Choose a team</button></section>}
  </main>;
}
