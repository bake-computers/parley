import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { WhyParleyIsBuiltTheWayItIsContentEn } from "#/content/why-parley-is-built-the-way-it-is.en";
import { whyParleyIsBuiltTheWayItIs } from "#/lib/content/blog-posts";
import { publicCache } from "#/lib/http-cache";

const POST_URL = `https://parley.bot/blog/${whyParleyIsBuiltTheWayItIs.slug}`;
const OG_IMAGE = "https://parley.bot/assets/parley-banner.png";

// Structured data for search engines and AI answer engines.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: whyParleyIsBuiltTheWayItIs.title,
  description: whyParleyIsBuiltTheWayItIs.description,
  image: OG_IMAGE,
  datePublished: whyParleyIsBuiltTheWayItIs.date,
  dateModified: whyParleyIsBuiltTheWayItIs.date,
  author: { "@type": "Organization", name: whyParleyIsBuiltTheWayItIs.author },
  publisher: { "@type": "Organization", name: "Parley", url: "https://parley.bot" },
  mainEntityOfPage: POST_URL,
};

export const Route = createFileRoute("/blog/why-parley-is-built-the-way-it-is")({
  headers: () => publicCache(3600, 86400, "page:blog-post"),
  head: () => ({
    meta: [
      { title: `${whyParleyIsBuiltTheWayItIs.title} | Parley` },
      { name: "description", content: whyParleyIsBuiltTheWayItIs.description },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: whyParleyIsBuiltTheWayItIs.title },
      { property: "og:description", content: whyParleyIsBuiltTheWayItIs.description },
      { property: "og:url", content: POST_URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:type", content: "article" },
      { property: "og:site_name", content: "Parley" },
      { property: "article:published_time", content: whyParleyIsBuiltTheWayItIs.date },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${whyParleyIsBuiltTheWayItIs.title} | Parley` },
      { name: "twitter:description", content: whyParleyIsBuiltTheWayItIs.description },
    ],
    links: [{ rel: "canonical", href: POST_URL }],
  }),
  component: BlogPostPage,
});

function BlogPostPage() {
  return (
    <div className="min-h-screen">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }}
      />
      <SiteHeader />
      <main className="py-16 md:py-24">
        <WhyParleyIsBuiltTheWayItIsContentEn />
      </main>
      <SiteFooter />
    </div>
  );
}
