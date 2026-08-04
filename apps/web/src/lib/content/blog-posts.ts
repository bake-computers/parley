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

export const whyParleyIsBuiltTheWayItIs: BlogPost = {
  slug: "why-parley-is-built-the-way-it-is",
  title: "Why Parley is built the way it is",
  author: "ryzm",
  description:
    "The reasoning behind Parley's stack: one Go engine that owns the truth, a protobuf wire contract, Cloudflare Workers at the edge, and a matchmaking model you can audit.",
  date: "2026-08-04",
  dateDisplay: "August 4, 2026",
};

/** Newest first. */
export const blogPosts: BlogPost[] = [whyParleyIsBuiltTheWayItIs];
