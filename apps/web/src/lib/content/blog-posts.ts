/** Metadata for posts under /blog; each post's route renders its content. */
export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  author: string;
  /** ISO date for meta tags and the sitemap. */
  date: string;
  dateDisplay: string;
}

export const whyWeLeftAxiom: BlogPost = {
  slug: "why-we-left-axiom",
  title: "Why we left Axiom",
  author: "Parley engineering",
  description:
    "We replaced Axiom with Cloudflare Pipelines and now keep only the events that matter: requests, slow queries, matchmaking, and failures.",
  date: "2026-08-15",
  dateDisplay: "August 15, 2026",
};

export const whyParleyIsBuiltTheWayItIs: BlogPost = {
  slug: "why-parley-is-built-the-way-it-is",
  title: "Why Parley is built the way it is",
  author: "Parley engineering",
  description:
    "The reasoning behind Parley's stack: one Go engine that owns the truth, a protobuf wire contract, Cloudflare Workers at the edge, and a matchmaking model you can audit.",
  date: "2026-08-04",
  dateDisplay: "August 4, 2026",
};

/** Newest first. */
export const blogPosts: BlogPost[] = [whyWeLeftAxiom, whyParleyIsBuiltTheWayItIs];
