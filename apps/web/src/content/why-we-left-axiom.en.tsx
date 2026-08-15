import type { ReactNode } from "react";
import { whyWeLeftAxiom } from "#/lib/content/blog-posts";

export function WhyWeLeftAxiomContentEn() {
  return (
    <>
      <header className="mx-auto w-full max-w-3xl px-6">
        <span className="text-sm font-medium text-muted-foreground">Engineering</span>
        <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
          Why we left Axiom.
        </h1>
        <p className="mt-4 text-sm text-muted-foreground/70">
          By {whyWeLeftAxiom.author}
          <span className="mx-2 text-border" aria-hidden="true">
            /
          </span>
          {whyWeLeftAxiom.dateDisplay}
        </p>
        <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
          The logging setup grew until it cost more to run than the events were worth. This post
          is the reasoning behind the swap and the short list of what we kept.
        </p>
      </header>

      <div className="mx-auto mt-12 w-full max-w-3xl space-y-10 px-6 text-sm leading-relaxed text-muted-foreground">
        <Section title="We were shipping everything.">
          <p>
            Every log line went to Axiom: boot messages, debug noise, health probes, &ldquo;loaded
            this&rdquo;, &ldquo;listening on that&rdquo;. Shipping everything is the easiest way to
            start and the hardest way to keep a log product useful. The signal drowned in the
            noise, and the bill grew with it.
          </p>
        </Section>

        <Section title="Axiom is a live log product. We do not need a live tail.">
          <p>
            Axiom is built for live tailing and interactive exploration, and it is good at both.
            Parley&apos;s operators almost never tail logs in real time. What they need is a place
            where the events that matter are kept, queryable weeks later, at a price that does not
            depend on how chatty the code is.
          </p>
        </Section>

        <Section title="Cloudflare already runs the edge. Pipelines writes Iceberg and Parquet to R2.">
          <p>
            The Discord worker and this site already run on Cloudflare. Pipelines is the same
            platform: the worker posts events to a stream binding, and Cloudflare writes them as
            Iceberg and Parquet into R2. No new vendor, no new dashboard, no extra hop for data
            that starts at the edge anyway.
          </p>
        </Section>

        <Section title="Delay is fine. Query with SQL later.">
          <p>
            A live tail buys you a second of freshness. Our events are diagnostic, not
            operational: nobody pages on a slow query. Minutes of delay are acceptable, and SQL
            over Parquet answers &ldquo;how many lobbies partitioned badly this week&rdquo; just
            fine. We traded a live UI for storage we already pay for.
          </p>
        </Section>

        <Section title="What we keep: requests, slow or failed queries, OVI partition results, real failures.">
          <p>
            The allowlist is short. Every request event from the engine and the worker, with the
            Discord terminals merged in. Database queries slower than 50 milliseconds, or that
            failed. One matchmaking event per successful partition, with team scores, balance
            gap, and the player list. Anything at warn level or above. That is enough to debug a
            lobby, a migration, or a bad deploy.
          </p>
        </Section>

        <Section title="What we drop: boot noise, debug, &ldquo;loaded this&rdquo;.">
          <p>
            &ldquo;Engine listening&rdquo;, &ldquo;migrations applied&rdquo;, &ldquo;model
            loaded&rdquo;, health probes: all of it stays on stderr for humans and never leaves
            the box. Debug lines never ship, full stop. If a startup problem happens, the
            container logs have it.
          </p>
        </Section>

        <Section title="Local sends nothing.">
          <p>
            Local development is exactly as loud as it was: JSON to stderr. The engine only opens
            a pipeline connection when both PIPELINES_INGEST_URL and PIPELINES_TOKEN are set, and
            the worker only has a pipeline binding in production. &ldquo;It worked locally&rdquo;
            is never contaminated by a half-configured remote.
          </p>
        </Section>
      </div>

      <footer className="mx-auto mt-16 w-full max-w-3xl px-6 text-sm leading-relaxed text-muted-foreground">
        <p>
          The old setup shipped everything and used almost none of it. The new one ships a small,
          deliberate set and uses more of it.
        </p>
        <p className="mt-4 text-xs text-muted-foreground/60">
          <a
            href={`/blog/${whyWeLeftAxiom.slug}.md`}
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
