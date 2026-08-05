import { createFileRoute } from "@tanstack/react-router";
import { DocsArticle, DocsLayout } from "#/components/docs/DocsLayout";
import { DiscordGuideContentEn } from "#/content/discord-guide.en";
import { publicCache } from "#/lib/http-cache";
import { docsPageHead, docsPageJsonLd } from "#/lib/docs/head";
import { getDocPage, type DocPage } from "#/lib/docs/manifest";

const guidePage = getDocPage("discord-guide");
if (!guidePage) {
  throw new Error("discord-guide missing from the docs manifest");
}
const page: DocPage = guidePage;

export const Route = createFileRoute("/docs/discord-guide")({
  headers: () => publicCache(3600, 86400, "page:docs"),
  head: () => {
    const head = docsPageHead(page);
    return {
      ...head,
      links: [
        ...head.links,
        // AI crawlers and other agents can read the plain-markdown twin instead.
        { rel: "alternate", type: "text/markdown", href: "/docs/discord-guide.md" },
      ],
    };
  },
  component: DiscordGuidePage,
});

function DiscordGuidePage() {
  return (
    <DocsLayout activeSlug={page.slug}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(docsPageJsonLd(page)) }}
      />
      <DocsArticle title={page.title} description={page.description}>
        <DiscordGuideContentEn />
      </DocsArticle>
    </DocsLayout>
  );
}
