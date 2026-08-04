import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { blogPosts } from "#/lib/content/blog-posts";
import { publicCache } from "#/lib/http-cache";

const BLOG_URL = "https://parley.bot/blog";

export const Route = createFileRoute("/blog/")({
  headers: () => publicCache(3600, 86400, "page:blog"),
  head: () => ({
    meta: [
      { title: "The Parley Blog | Notes on building a matchmaking platform" },
      {
        name: "description",
        content:
          "Notes on building Parley: the engineering decisions behind the competitive matchmaking and tournament platform.",
      },
      { property: "og:title", content: "The Parley Blog" },
      {
        property: "og:description",
        content:
          "Notes on building Parley: the engineering decisions behind the competitive matchmaking and tournament platform.",
      },
      { property: "og:url", content: BLOG_URL },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "The Parley Blog" },
      {
        name: "twitter:description",
        content:
          "Notes on building Parley: the engineering decisions behind the competitive matchmaking and tournament platform.",
      },
    ],
    links: [{ rel: "canonical", href: BLOG_URL }],
  }),
  component: BlogIndexPage,
});

function BlogIndexPage() {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="py-16 md:py-24">
        <div className="mx-auto w-full max-w-3xl px-6">
          <header className="border-b border-border/30 pb-8">
            <span className="text-sm font-medium text-muted-foreground">Parley</span>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              The Parley Blog
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Notes on building Parley: the engineering decisions behind the matchmaking and
              tournament platform.
            </p>
          </header>

          <div className="mt-10 space-y-12">
            {blogPosts.map((post) => (
              <article key={post.slug}>
                <a href={`/blog/${post.slug}`} className="group block">
                  <p className="text-xs text-muted-foreground/60">{post.dateDisplay}</p>
                  <h2 className="mt-2 text-lg font-medium text-foreground transition-colors duration-200 group-hover:text-foreground/70">
                    {post.title}
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {post.description}
                  </p>
                </a>
              </article>
            ))}
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
