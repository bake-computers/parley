import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAuthMe } from "#/hooks/useAuthMe";

export const Route = createFileRoute("/tournaments/create")({ component: CreateTournamentPage });

function CreateTournamentPage() {
  const { handoff } = Route.useSearch() as { handoff?: string };
  const { me } = useAuthMe();
  const [submitted, setSubmitted] = useState(false);
  if (!me) return <main className="mx-auto max-w-xl p-8"><h1>Create a tournament</h1><p>Sign in with Discord to confirm you can manage the host server.</p><Link to="/auth/login" search={{ redirect: `/tournaments/create?handoff=${handoff ?? ""}` }}>Log in with Discord</Link></main>;
  return <main className="mx-auto max-w-2xl p-8"><h1>Create a tournament</h1><p className="text-muted-foreground">Configure your R6 event. The host server and your Discord identity are verified when you submit.</p>
    {submitted ? <p>Your tournament is being created. Share its code with your teams when setup completes.</p> : <form className="mt-6 grid gap-4" onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}>
      <input required name="name" placeholder="Tournament name" className="border rounded p-2" />
      <select name="format" className="border rounded p-2"><option>5v5 single_elimination</option><option>5v5 double_elimination</option><option>3v3 single_elimination</option><option>2v2 single_elimination</option><option>1v1 single_elimination</option></select>
      <input required type="number" min="2" max="64" defaultValue="8" name="teamCap" className="border rounded p-2" />
      <textarea name="rules" placeholder="Rules and event details" className="border rounded p-2" />
      <button className="rounded bg-primary p-2 text-primary-foreground">Create tournament</button>
    </form>}
  </main>;
}
