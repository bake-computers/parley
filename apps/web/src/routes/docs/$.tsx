import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { DocsArticle, DocsLayout } from "#/components/docs/DocsLayout";
import { mdxComponents } from "#/components/docs/mdx";
import { publicCache } from "#/lib/http-cache";
import { docsPageHead, docsPageJsonLd } from "#/lib/docs/head";
import { getDocPage } from "#/lib/docs/manifest";

interface MdxModule {
  default: (props: { components?: Record<string, unknown> }) => ReactElement;
}

// Eager glob: docs content is small and shares one route chunk, so no lazy dance.
const mdxBySlug: Record<string, MdxModule["default"]> = {};
const modules = import.meta.glob("../../content/docs/**/*.mdx", { eager: true }) as Record<string, MdxModule>;
for (const [path, mod] of Object.entries(modules)) {
  const slug = path.replace("../../content/docs/", "").replace(/\.mdx$/, "").replace(/\/index$/, "");
  mdxBySlug[slug] = mod.default;
}

export const Route = createFileRoute("/docs/$")({
  headers: () => publicCache(3600, 86400, "page:docs"),
  loader: ({ params }) => {
    const page = getDocPage(params._splat ?? "");
    if (!page || page.custom) {
      throw notFound();
    }
    return { page };
  },
  head: ({ loaderData }) => (loaderData ? docsPageHead(loaderData.page) : {}),
  component: DocsMdxPage,
});

function DocsMdxPage() {
  const { page } = Route.useLoaderData();
  const Content = mdxBySlug[page.slug];

  return (
    <DocsLayout activeSlug={page.slug}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(docsPageJsonLd(page)) }}
      />
      <DocsArticle title={page.title} description={page.description}>
        <Content components={mdxComponents} />
      </DocsArticle>
    </DocsLayout>
  );
}
