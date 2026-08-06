/** Single source of truth for the /docs sidebar, page meta, and SEO tags. */

export interface DocPage {
  /** URL segment after /docs/, e.g. "commands/link". */
  slug: string;
  title: string;
  description: string;
  group: string;
  /** Order within its group, ascending. */
  order: number;
  /** True for pages rendered from TSX instead of MDX content. */
  custom?: boolean;
}

export interface DocGroup {
  label: string;
  pages: DocPage[];
}

export const DOC_PAGES: DocPage[] = [
  {
    slug: "discord-guide",
    title: "Parley for Discord users",
    description:
      "The visual guide to Parley in Discord: link your account, check your rank, and play balanced matches.",
    group: "Getting started",
    order: 0,
    custom: true,
  },
  {
    slug: "getting-started",
    title: "Getting started",
    description:
      "Add Parley to your server and link your Rainbow Six Siege account in a few minutes.",
    group: "Getting started",
    order: 1,
  },
  {
    slug: "getting-started/link-your-account",
    title: "Link your account",
    description:
      "Walk through the /link wizard to connect your Ubisoft, Xbox, or PlayStation account to Parley.",
    group: "Getting started",
    order: 2,
  },
  {
    slug: "commands",
    title: "Commands",
    description: "Every Parley slash command at a glance, with requirements and where to read more.",
    group: "Commands",
    order: 1,
  },
  {
    slug: "commands/link",
    title: "/link",
    description:
      "Link your Discord to your Rainbow Six Siege profiles, one per platform, and manage existing links.",
    group: "Commands",
    order: 2,
  },
  {
    slug: "commands/profile",
    title: "/profile",
    description: "View your linked Rainbow Six Siege accounts and your Parley Rank on each.",
    group: "Commands",
    order: 3,
  },
  {
    slug: "commands/history",
    title: "/history",
    description:
      "Page through recent Parley matches in your server, with per-player K/D/A and rating changes.",
    group: "Commands",
    order: 4,
  },
  {
    slug: "commands/user",
    title: "/user",
    description: "Manage your matchmaking opt-out, profile visibility, stats refresh, and data deletion.",
    group: "Commands",
    order: 5,
  },
  {
    slug: "commands/tournament",
    title: "/tournament",
    description: "Create a tournament on the Parley website or open one with its share code.",
    group: "Commands",
    order: 6,
  },
  {
    slug: "commands/team",
    title: "/team",
    description:
      "Assemble balanced custom teams, log round-by-round K/D/A, and settle the match with rating updates.",
    group: "Commands",
    order: 7,
  },
  {
    slug: "ranks-and-stats",
    title: "Ranks and stats",
    description: "How Parley measures skill and what the numbers on your profile mean.",
    group: "Ranks and stats",
    order: 1,
  },
  {
    slug: "ranks-and-stats/parley-rank",
    title: "Parley Rank",
    description: "The ten-tier skill ladder Parley uses for matchmaking and tournaments.",
    group: "Ranks and stats",
    order: 2,
  },
  {
    slug: "ranks-and-stats/your-stats",
    title: "Your stats",
    description: "What Parley reads from your Rainbow Six Siege profile and how it uses the numbers.",
    group: "Ranks and stats",
    order: 3,
  },
  {
    slug: "matchmaking",
    title: "Matchmaking",
    description: "How Parley builds balanced teams and keeps lobbies fair.",
    group: "Matchmaking",
    order: 1,
  },
  {
    slug: "matchmaking/eligibility",
    title: "Eligibility",
    description: "Every reason Parley might leave you out of a match, and how to fix each one.",
    group: "Matchmaking",
    order: 2,
  },
  {
    slug: "tournaments",
    title: "Tournaments",
    description: "Run and join Rainbow Six Siege tournaments with Parley.",
    group: "Tournaments",
    order: 1,
  },
  {
    slug: "tournaments/create-a-tournament",
    title: "Create a tournament",
    description: "Start a tournament from Discord and finish the setup on the Parley website.",
    group: "Tournaments",
    order: 2,
  },
  {
    slug: "tournaments/join-a-tournament",
    title: "Join a tournament",
    description: "Go from a share code to a spot on the roster.",
    group: "Tournaments",
    order: 3,
  },
  {
    slug: "privacy-and-data",
    title: "Privacy and data",
    description: "What Parley stores, what you control, and how to delete everything.",
    group: "More",
    order: 1,
  },
  {
    slug: "faq",
    title: "FAQ",
    description: "Quick answers to the most common Parley questions.",
    group: "More",
    order: 2,
  },
];

export function getDocPage(slug: string): DocPage | undefined {
  return DOC_PAGES.find((page) => page.slug === slug);
}

const groupOrder = ["Getting started", "Commands", "Ranks and stats", "Matchmaking", "Tournaments", "More"];

export const DOC_GROUPS: DocGroup[] = groupOrder.map((label) => ({
  label,
  pages: DOC_PAGES.filter((page) => page.group === label).sort((a, b) => a.order - b.order),
}));

export function docHref(slug: string): string {
  return `/docs/${slug}`;
}
