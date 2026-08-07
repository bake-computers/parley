const OG_IMAGE = "https://parley.bot/assets/parley-banner.png";
const SITE = "https://parley.bot";

export function profilePageUrl(username: string): string {
  return `${SITE}/@${encodeURIComponent(username)}`;
}

export function profilePageHead(opts: {
  username: string;
  displayName: string;
  description: string;
  robots?: string;
  noindex?: boolean;
}) {
  const url = profilePageUrl(opts.username);
  const title = `${opts.displayName} (@${opts.username}) · Parley`;
  const robots = opts.noindex
    ? "noindex, nofollow"
    : (opts.robots ?? "index, follow, max-image-preview:large");

  return {
    meta: [
      { title },
      { name: "description", content: opts.description },
      { name: "robots", content: robots },
      { property: "og:title", content: title },
      { property: "og:description", content: opts.description },
      { property: "og:url", content: url },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:type", content: "profile" },
      { property: "og:site_name", content: "Parley" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: opts.description },
    ],
    links: [{ rel: "canonical", href: url }],
  };
}

export function profileJsonLd(opts: {
  username: string;
  displayName: string;
  description: string;
  avatarUrl?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    name: opts.displayName,
    description: opts.description,
    url: profilePageUrl(opts.username),
    mainEntity: {
      "@type": "Person",
      name: opts.displayName,
      alternateName: opts.username,
      ...(opts.avatarUrl ? { image: opts.avatarUrl } : {}),
    },
    publisher: { "@type": "Organization", name: "Parley", url: SITE },
  };
}

/** Serialize JSON-LD for a script tag. Escapes `<` so user-controlled strings cannot break out. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
