import type { DocPage } from "./manifest";

const OG_IMAGE = "https://parley.bot/assets/parley-banner.png";

export function docsPageUrl(page: DocPage): string {
  return `https://parley.bot/docs/${page.slug}`;
}

export function docsPageHead(page: DocPage) {
  const url = docsPageUrl(page);
  const title = `${page.title} | Parley Docs`;

  return {
    meta: [
      { title },
      { name: "description", content: page.description },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: title },
      { property: "og:description", content: page.description },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:type", content: "article" },
      { property: "og:site_name", content: "Parley" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: page.description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

/** Structured data for search engines and AI answer engines. */
export function docsPageJsonLd(page: DocPage) {
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    headline: page.title,
    description: page.description,
    image: OG_IMAGE,
    mainEntityOfPage: docsPageUrl(page),
    publisher: { "@type": "Organization", name: "Parley", url: "https://parley.bot" },
  };
}
