import type { Messages } from "./types.js";

export const messagesEn: Messages = {
  nav: {
    problem: "The problem",
    story: "Our story",
    matchmaking: "Matchmaking",
    experience: "How it works",
    faq: "FAQ",
    joinDiscord: "Join the beta",
    resources: "Resources",
    authorize: "Authorize",
    dashboard: "Dashboard",
    account: "Account",
    signOut: "Sign out",
    openMenu: "Open navigation",
    closeMenu: "Close navigation",
    brand: "Parley",
  },
  footer: {
    legalNotice: "Legal notice",
    privacy: "Privacy policy",
    terms: "Terms of service",
    docs: "Docs",
    blog: "Blog",
    home: "Home",
    productGroup: "Product",
    communityGroup: "Community",
    legalGroup: "Legal",
    discordServer: "Discord",
    poweredBy: "Powered by",
    notUbisoft: "Not affiliated with Ubisoft",
    notDiscord: "Not affiliated with Discord Inc.",
    projectOf: "Baked by bake computers",
  },
  notFound: {
    label: "Error 404",
    title: "Page not found.",
    body: "The page you're looking for doesn't exist or has been moved. If you believe this is an error, reach out on Discord.",
    home: "Back to home",
    discord: "Join Discord",
  },
  legal: { lastUpdated: "Last updated:" },
  home: {
    hero: {
      titleBefore: "Fair, ",
      titleHighlight: "skill-matched",
      titleAfter: " Rainbow Six Siege.",
      subtitle:
        "The Rainbow Six Siege Discord bot for balanced lobbies, scrims, and tournaments, run on real telemetry.",
      ctaDiscord: "Join the beta",
      ctaHow: "See how it works",
      explore: "Explore",
    },
    problem: {
      titleBefore: "The ranked grind is ",
      titleHighlight: "broken by design.",
      subtitle: "Take Siege seriously and public matchmaking fights you every round.",
      symptoms: [
        {
          title: "Lopsided lobbies",
          body: "Public matchmaking throws mismatched skill levels together. Stomps replace the close rounds you want.",
        },
        {
          title: "Unreliable teammates",
          body: "Leavers and throwers wreck games before they start. No accountability, no structure.",
        },
        {
          title: "No real balance",
          body: "Standard matchmaking ignores how you actually play. Without telemetry, fair is a guess.",
        },
      ],
    },
    story: {
      titleBefore: "Born from a server that ",
      titleHighlight: "could not stop arguing over teams.",
      paragraphs: [
        "Parley started on a friend Discord where ten of us ran custom Siege every weekend.",
        "We spent forever building teams. One side always felt picked on. Same fight, every Saturday.",
        "So we built the tool we wished we had: automatic balance before the first round starts.",
      ],
      pullQuote: "Ten players. Two teams. Forty-five minutes of arguing, every Saturday.",
      founderRole: "Founder",
      coFounderRole: "Co-founder",
      avatarAlt: "avatar",
    },
    matchmaking: {
      title: "Matchmaking driven by skill and telemetry.",
      subtitle:
        "Parley models how you actually perform and builds balanced teams that make every round count.",
      points: [
        {
          title: "Built on real performance",
          body: "Aim, impact, clutch rate, and role consistency feed the rating, not just win/loss.",
        },
        {
          title: "Balanced both sides",
          body: "Teams are assembled to minimize skill gaps so rounds stay close and earned.",
        },
        {
          title: "Always adapting",
          body: "Ratings update as you play. Improve and your matches climb with you.",
        },
      ],
    },
    lobby: {
      statusHeader: "Lobby status",
      statusUnbalanced: "Unbalanced",
      statusBalancing: "Balancing…",
      statusBalanced: "Balanced",
      liveBalanced: "Lobby balanced. Teams are skill-matched.",
      liveBalancing: "Balancing teams by skill rating.",
      liveUnbalanced: "Lobby unbalanced. High skill delta detected.",
      teamAlpha: "Team Alpha",
      teamBeta: "Team Bravo",
      playersAria: "players",
    },
    experience: {
      title: "From lobby to trophy, handled for you.",
      steps: [
        {
          title: "Automated team formation",
          body: "Play solo or with friends. Parley assembles balanced rosters around skill and role fit.",
          detail: ["Skill + role-fit balancing", "Solo or stack friendly", "No captain picks"],
        },
        {
          title: "Tournament brackets",
          body: "Seeding, check-ins, and progression run themselves so events stay fair and on time.",
          detail: ["Automatic seeding", "Self-running check-ins", "Live progression"],
        },
      ],
    },
    discordCta: {
      title: "The beta is open.",
      body: "Parley runs as a Discord app. Join the server, add the bot, and run your first balanced lobby tonight.",
      button: "Join the beta",
    },
    midCta: {
      title: "Balanced teams, before round one.",
      body: "Add the bot to your server and skip the lobby argument forever.",
      button: "Join the beta",
    },
    faq: {
      title: "Questions, answered.",
      subtitle: "Everything you need to know about the Discord beta.",
      items: [
        {
          q: "Is Parley live?",
          a: "Parley is in open beta on Discord. Join the server, add the bot, and it runs for your community tonight.",
        },
        {
          q: "How do I use Parley in the beta?",
          a: "Parley runs as a Discord app. Form teams, run scrims, and join tournaments directly through Discord.",
        },
        {
          q: "Will there be a web app?",
          a: "Yes. A full web experience is planned after the Discord beta, with backward compatibility for your Discord setup.",
        },
        {
          q: "What makes the matchmaking different?",
          a: "Parley uses real in-game telemetry: aim, impact, role consistency, and recent form, not just win/loss.",
        },
        {
          q: "Does it cost anything to join?",
          a: "No. The beta is free. Add the bot from the Discord server and you're set.",
        },
      ],
    },
  },
  theme: {
    light: "Light mode",
    system: "System theme",
    dark: "Dark mode",
    label: "Theme",
  },
  legalPages: {
    privacyLabel: "Privacy",
    privacyTitle: "Privacy Policy",
    termsLabel: "Legal",
    termsTitle: "Terms of Service",
    legalNoticeLabel: "Legal",
    legalNoticeTitle: "Legal Notice",
    privacyUpdated: "August 9, 2026",
    termsUpdated: "June 7, 2026",
    legalNoticeUpdated: "June 21, 2026",
    termsFooter:
      "This document was last updated on June 7, 2026. By continuing to use the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms.",
    privacyFooter:
      "This document was last updated on August 9, 2026. It is effective as of that date and supersedes all prior versions.",
  },
};
