import type { Messages } from "./types.js";

export const messagesEn: Messages = {
  nav: {
    problem: "The problem",
    story: "Our story",
    matchmaking: "Matchmaking",
    experience: "How it works",
    faq: "FAQ",
    joinDiscord: "Join Discord",
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
    poweredBy: "Powered by",
    notUbisoft: "Not affiliated with Ubisoft",
    notDiscord: "Not affiliated with Discord Inc.",
    projectOf: "A project of pactum computers",
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
        "A Discord app that builds balanced teams from real skill and telemetry, then automates scrims and tournaments.",
      ctaDiscord: "Join Discord",
      ctaHow: "See how it works",
      explore: "Explore",
    },
    problem: {
      titleBefore: "The ranked grind is ",
      titleHighlight: "broken by design.",
      subtitle: "Take Siege seriously and public matchmaking fights you every round.",
      costLabel: "What it costs you",
      costSuffix: "recurring failures Parley is built to remove before the Discord app launches.",
      costFootnote: "Match report / public matchmaking",
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
      teamAlpha: "Team α",
      teamBeta: "Team β",
      playersAria: "players",
      balanceScore: "Balance score",
      rebalance: "Rebalance lobby",
      footnote: "Illustrative preview. Live matchmaking runs inside the Discord app at launch.",
    },
    experience: {
      title: "From lobby to trophy, handled for you.",
      previewNote: "Interactive preview. The Discord app is not live yet.",
      steps: [
        {
          title: "Automated team formation",
          body: "Play solo or with friends. Parley assembles balanced rosters around skill and role fit.",
          detail: ["Skill + role-fit balancing", "Solo or stack friendly", "No captain picks"],
        },
        {
          title: "Scrims on demand",
          body: "Structured scrims against evenly-rated teams, scheduled without endless DMs.",
          detail: ["Evenly-rated opponents", "Auto-scheduled slots", "Zero DM coordination"],
        },
        {
          title: "Tournament brackets",
          body: "Seeding, check-ins, and progression run themselves so events stay fair and on time.",
          detail: ["Automatic seeding", "Self-running check-ins", "Live progression"],
        },
      ],
    },
    discordCta: {
      title: "Join the Discord for launch updates.",
      body: "Parley launches as a Discord app first. Hop into the server to get notified the moment the bot goes live.",
      button: "Join the Discord",
      note: "Launch announcements drop in the server first. No account required.",
    },
    faq: {
      title: "Questions, answered.",
      subtitle: "Everything you need to know before the Discord app launches.",
      items: [
        {
          q: "Is Parley live yet?",
          a: "Not yet. Parley is in pre-launch. Join the Discord to be notified the moment the app goes live.",
        },
        {
          q: "How will I use Parley at launch?",
          a: "Parley launches as a Discord app first. Form teams, run scrims, and join tournaments directly through Discord.",
        },
        {
          q: "Will there be a web app?",
          a: "Yes. A full web experience is planned after the Discord launch, with backward compatibility for your Discord setup.",
        },
        {
          q: "What makes the matchmaking different?",
          a: "Parley uses real in-game telemetry: aim, impact, role consistency, and recent form, not just win/loss.",
        },
        {
          q: "Does it cost anything to join?",
          a: "No. Joining the Discord is free and only signs you up for launch updates.",
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
    privacyUpdated: "June 24, 2026",
    termsUpdated: "June 7, 2026",
    legalNoticeUpdated: "June 21, 2026",
    termsFooter:
      "This document was last updated on June 7, 2026. By continuing to use the Service, you acknowledge that you have read, understood, and agree to be bound by these Terms.",
    privacyFooter:
      "This document was last updated on June 24, 2026. It is effective as of that date and supersedes all prior versions.",
  },
};
