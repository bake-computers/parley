import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { WhyWeLeftAxiomContentEn } from "#/content/why-we-left-axiom.en";
import { whyWeLeftAxiom } from "#/lib/content/blog-posts";
import { publicCache } from "#/lib/http-cache";

const POST_URL = `https://parley.bot/blog/${whyWeLeftAxiom.slug}`;
const OG_IMAGE = "https://parley.bot/assets/parley-banner.png";

// Structured data for search engines and AI answer engines.
const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  headline: whyWeLeftAxiom.title,
  description: whyWeLeftAxiom.description,
  image: OG_IMAGE,
  datePublished: whyWeLeftAxiom.date,
  dateModified: whyWeLeftAxiom.date,
  author: { "@type": "Person", name: whyWeLeftAxiom.author },
  publisher: { "@type": "Organization", name: "Parley", url: "https://parley.bot" },
  mainEntityOfPage: POST_URL,
};

export const Route = createFileRoute("/blog/why-we-left-axiom")({
  headers: () => publicCache(3600, 86400, "page:blog-post"),
  head: () => ({
    meta: [
      { title: `${whyWeLeftAxiom.title} | Parley` },
      { name: "description", content: whyWeLeftAxiom.description },
      { name: "robots", content: "index, follow, max-image-preview:large" },
      { property: "og:title", content: whyWeLeftAxiom.title },
      { property: "og:description", content: whyWeLeftAxiom.description },
      { property: "og:url", content: POST_URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:type", content: "article" },
      { property: "og:site_name", content: "Parley" },
      { property: "article:published_time", content: whyWeLeftAxiom.date },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${whyWeLeftAxiom.title} | Parley` },
      { name: "twitter:description", content: whyWeLeftAxiom.description },
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
        <WhyWeLeftAxiomContentEn />
      </main>
      <SiteFooter />
    </div>
  );
}
