import { createFileRoute } from "@tanstack/react-router";
import { ArrowRight, BookOpen } from "lucide-react";
import { DocsLayout } from "#/components/docs/DocsLayout";
import { publicCache } from "#/lib/http-cache";
import { DOC_GROUPS, docHref } from "#/lib/docs/manifest";

const DOCS_URL = "https://parley.bot/docs";

export const Route = createFileRoute("/docs/")({
  headers: () => publicCache(3600, 86400, "page:docs"),
  head: () => ({
    meta: [
      { title: "Parley Docs — Guides for Discord players and tournament organizers" },
      {
        name: "description",
        content:
          "How to use Parley, the Rainbow Six Siege Discord bot: link your account, understand ranks and stats, run balanced matchmaking, and host tournaments.",
      },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: "Parley Docs" },
      {
        property: "og:description",
        content:
          "How to use Parley, the Rainbow Six Siege Discord bot: link your account, understand ranks and stats, run balanced matchmaking, and host tournaments.",
      },
      { property: "og:url", content: DOCS_URL },
      { property: "og:image", content: "https://parley.bot/assets/parley-banner.png" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Parley" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: DOCS_URL }],
  }),
  component: DocsIndexPage,
});

function DocsIndexPage() {
  return (
    <DocsLayout activeSlug={null}>
      <header className="max-w-3xl border-b border-border/30 pb-8">
        <span className="text-sm font-medium text-muted-foreground">Documentation</span>
        <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          Parley, explained.
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground md:text-base">
          Everything you need to play on Parley: linking your Rainbow Six Siege account, reading your
          rank, running balanced matches, and hosting tournaments. Written for players and server
          admins, not developers.
        </p>
      </header>

      <a href={docHref("discord-guide")} className="glass-panel group mt-8 block max-w-3xl rounded-2xl p-6">
        <div className="flex items-center gap-2 text-foreground">
          <BookOpen className="size-4" aria-hidden="true" />
          <span className="text-sm font-semibold">Start here: Parley for Discord users</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The five-minute visual guide — add Parley, link your account, and play your first balanced
          match.
        </p>
        <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
          Read the guide
          <ArrowRight className="parley-arrow-nudge size-3.5" aria-hidden="true" />
        </span>
      </a>

      <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-2">
        {DOC_GROUPS.filter((group) => group.label !== "More").map((group) => {
          const landing = group.pages.find((page) => !page.custom) ?? group.pages[0];
          return (
            <a
              key={group.label}
              href={docHref(landing.slug)}
              className="rounded-xl border border-border/70 bg-card/60 p-4 transition-colors hover:border-border"
            >
              <p className="text-sm font-semibold text-foreground">{group.label}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {landing.description}
              </p>
            </a>
          );
        })}
      </div>
    </DocsLayout>
  );
}
