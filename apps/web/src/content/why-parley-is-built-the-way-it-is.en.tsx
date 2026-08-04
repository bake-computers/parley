import type { ReactNode } from "react";
import { whyParleyIsBuiltTheWayItIs } from "#/lib/content/blog-posts";

export function WhyParleyIsBuiltTheWayItIsContentEn() {
  return (
    <>
      <header className="mx-auto w-full max-w-3xl px-6">
        <span className="text-sm font-medium text-muted-foreground">Engineering</span>
        <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
          Why Parley is built the way it is.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground/70">
          By {whyParleyIsBuiltTheWayItIs.author}
          <span className="mx-2 text-border" aria-hidden="true">
            /
          </span>
          {whyParleyIsBuiltTheWayItIs.dateDisplay}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          The reasoning behind the stack: the decisions and their trade-offs, not the documentation.
          The diagram below shows how the pieces fit together.
        </p>
      </header>

      <figure className="mx-auto mt-12 w-full max-w-6xl">
        <img
          src="/assets/parley-architecture-overview.webp"
          alt="Overview diagram of Parley's architecture"
          className="h-auto w-full"
          loading="lazy"
        />
      </figure>

      <div className="mx-auto mt-12 w-full max-w-3xl space-y-10 px-6 text-sm leading-relaxed text-muted-foreground">
        <Section title="One engine owns the truth.">
          <p>
            Account links, ratings, match records, and brackets all live in one Postgres database
            behind one Go service. The edge apps are stateless and disposable: they hold nothing,
            so they can be redeployed at will.
          </p>
          <p>
            Microservices were considered and rejected. One engineer maintains this project, and
            service boundaries here would add deploys, wire hops, and cross-service coordination
            where today there is one process and one schema. The monolith is sized to the team,
            not to the ambition.
          </p>
        </Section>

        <Section title="A shared schema, not shared code.">
          <p>
            The wire contract is defined once in protobuf and generated into both Go and
            TypeScript. Engine and edge never share structs. A change is wire-compatible, or it
            does not merge.
          </p>
          <p>
            The alternatives are a library shared across two languages — one build system serving
            both — or handwritten JSON types kept in sync by review. Both fail the same way
            eventually: one side drifts, and the bug surfaces mid-lobby at runtime instead of at
            build time. Generating from one source lets each language&apos;s compiler do the
            checking.
          </p>
        </Section>

        <Section title="The edge lives where players are.">
          <p>
            The Discord bot and this site run on Cloudflare Workers: stateless, global, and zero
            servers to babysit. Interactions are answered close to the player; the domain work is
            delegated to the engine.
          </p>
          <p>
            The rejected alternative was hosting the bot beside the engine on one box. It would
            have worked — but Discord interactions are latency-bound and players are everywhere,
            so answering from a single region trades reach for a machine to patch and keep alive.
          </p>
        </Section>

        <Section title="RPC over plain HTTP.">
          <p>
            ConnectRPC gives us typed RPCs as ordinary HTTP requests. Native gRPC is built on
            HTTP/2 end to end, and Workers cannot speak it from fetch — running gRPC at the edge
            would mean proxies and protocol translation. The Connect protocol is a standard POST
            with a JSON or protobuf body: HTTP/1.1-compatible, readable with curl, and callable
            from anything that can fetch.
          </p>
        </Section>

        <Section title="A boring database.">
          <p>
            Postgres is the system of record: relational data, transactions, and a migration story
            we understand. Nothing exotic to learn, nothing exotic to lose data.
          </p>
          <p>
            We prefer additive, backwards-compatible migrations so deployments do not require
            synchronized cutovers: old code keeps serving against the new schema while new code
            rolls out. Renames, backfills, constraints, and removals still happen — they happen in
            stages, never in one coordinated flag day.
          </p>
          <p>
            The alternative was a store per concern: one for ratings, one for brackets, one for
            identity. Postgres won because it is boring, reliably so, and because I know it well.
            Three stores would have been three backups, three failure modes, and a distributed
            transaction where one database gives you a local one.
          </p>
        </Section>

        <Section title="A model you can audit.">
          <p>
            The matchmaking score is a single linear model: six weights, one per dimension of each
            player&apos;s dual-anchor playstyle vector — K/D, entry, trade, clutch, exec, and
            season win rate. It decides who plays with whom, so we chose something that can be
            printed, diffed, and argued with over a black box that must be trusted. Every
            parameter of complexity beyond linearity is a parameter of opacity.
          </p>
          <p>
            A nonlinear model would likely predict a touch better. The cost is that when someone
            asks why their lobby looks the way it does, the honest answer becomes “the model said
            so” — and a matchmaking system that cannot explain itself cannot be fixed when it is
            wrong.
          </p>
        </Section>

        <Section title="Model deployment is a file upload.">
          <p>
            Models arrive as objects and are strictly validated at startup, so anything unexpected
            fails to load. A new engine instance does not become ready unless it can fully
            validate and load its model — a bad upload leaves the healthy deployment serving
            instead of taking it down. No registry, no canary machinery; rolling back is uploading
            the previous object.
          </p>
        </Section>

        <Section title="Glicko-2 keeps the memory.">
          <p>
            The score decides tonight&apos;s teams; Glicko-2 carries persistent ratings forward
            across matches. Proven, lightweight, well understood: the right amount of machinery
            for remembering results.
          </p>
          <p>
            The alternatives were a hand-rolled Elo with its known blind spots, or a heavier
            Bayesian stack that buys little here beyond more to tune. Glicko-2 is published
            mathematics that decays uncertainty when players go quiet, and it runs in microseconds
            inside the engine we already have.
          </p>
        </Section>

        <Section title="Exhaustive, not heuristic.">
          <p>
            Team selection enumerates every valid split of the lobby, because lobbies are small
            enough to do so. The result is a genuine optimum of the objective, not an
            approximation of one.
          </p>
          <p>
            Greedy or sampled search is the right move once the search space outgrows the clock.
            Below that threshold, a heuristic is the same work with an error term bolted on, so we
            enumerate.
          </p>
        </Section>

        <Section title="What we did not build.">
          <p>
            No feature store, no GPU path, no embedding service, no model-version table. Each
            would answer a question Parley does not have, and each was weighed against the same
            cost: another thing to operate, secure, and keep honest. The contracts are built so
            that if one ever arrives, the system grows without rewriting what is here.
          </p>
        </Section>
      </div>

      <footer className="mx-auto mt-16 w-full max-w-3xl px-6 text-sm leading-relaxed text-muted-foreground">
        <p className="text-xs text-muted-foreground/60">
          <a
            href={`/blog/${whyParleyIsBuiltTheWayItIs.slug}.md`}
            className="underline decoration-border/60 underline-offset-2 transition-colors duration-200 hover:text-foreground"
          >
            View this post as Markdown
          </a>
        </p>
      </footer>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 text-base font-medium text-foreground">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
