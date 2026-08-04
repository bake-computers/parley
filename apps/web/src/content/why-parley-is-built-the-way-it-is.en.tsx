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
          Account links, ratings, match records, and brackets all live in one Postgres database
          behind one Go service. The edge apps are stateless and disposable: they hold nothing, so
          they can be redeployed at will.
        </Section>

        <Section title="A shared schema, not shared code.">
          The wire contract is defined once in protobuf and generated into both Go and TypeScript.
          Engine and edge never share structs. A change is wire-compatible, or it does not merge.
        </Section>

        <Section title="The edge lives where players are.">
          The Discord bot and this site run on Cloudflare Workers: stateless, global, and zero
          servers to babysit. Interactions are answered close to the player; the domain work is
          delegated to the engine.
        </Section>

        <Section title="RPC over plain HTTP.">
          ConnectRPC gives us typed RPCs without the browser and Worker baggage of gRPC. It is just
          HTTP, which every client already speaks.
        </Section>

        <Section title="A boring database.">
          Postgres is the system of record: relational data, transactions, and migrations that only
          ever add. Nothing exotic to learn, nothing exotic to lose data.
        </Section>

        <Section title="A model you can audit.">
          The matchmaking score is a single linear model: seven numbers. It decides who plays with
          whom, so we chose something that can be printed, diffed, and argued with over a black box
          that must be trusted. Every parameter of complexity beyond linearity is a parameter of
          opacity.
        </Section>

        <Section title="Model deployment is a file upload.">
          Models arrive as objects and are strictly validated at startup, so anything unexpected
          fails to load. The engine does not boot without a model it can fully verify. No registry,
          no canary machinery; rolling back is uploading the previous object.
        </Section>

        <Section title="Glicko-2 keeps the memory.">
          The score decides tonight&apos;s teams; Glicko-2 carries persistent ratings forward across
          matches. Proven, lightweight, well understood: the right amount of machinery for
          remembering results.
        </Section>

        <Section title="Exhaustive, not heuristic.">
          Team selection enumerates every valid split of the lobby, because lobbies are small enough
          to do so. The result is a genuine optimum of the objective, not an approximation of one.
        </Section>

        <Section title="What we did not build.">
          No feature store, no GPU path, no embedding service, no model-version table. Each would
          answer a question Parley does not have. The contracts are built so that if one ever
          arrives, the system grows without rewriting what is here.
        </Section>
      </div>

      <footer className="mx-auto mt-16 w-full max-w-3xl px-6 text-sm leading-relaxed text-muted-foreground">
        <p>Regards,</p>
        <p className="mt-1 font-medium text-foreground">{whyParleyIsBuiltTheWayItIs.author}</p>
        <p className="mt-6 text-xs text-muted-foreground/60">
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
      <p>{children}</p>
    </section>
  );
}
