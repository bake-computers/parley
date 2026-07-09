export type Messages = {
  nav: {
    problem: string;
    story: string;
    matchmaking: string;
    experience: string;
    leaderboard: string;
    faq: string;
    joinDiscord: string;
    resources: string;
    authorize: string;
    dashboard: string;
    account: string;
    signOut: string;
    openMenu: string;
    closeMenu: string;
    brand: string;
  };
  footer: {
    leaderboard: string;
    legalNotice: string;
    privacy: string;
    terms: string;
    poweredBy: string;
    notUbisoft: string;
    notDiscord: string;
    projectOf: string;
  };
  notFound: {
    label: string;
    title: string;
    body: string;
    home: string;
    discord: string;
  };
  legal: { lastUpdated: string };
  home: {
    hero: {
      titleBefore: string;
      titleHighlight: string;
      titleAfter: string;
      subtitle: string;
      ctaDiscord: string;
      ctaHow: string;
      explore: string;
    };
    problem: {
      titleBefore: string;
      titleHighlight: string;
      subtitle: string;
      costLabel: string;
      costSuffix: string;
      costFootnote: string;
      symptoms: { title: string; body: string }[];
    };
    story: {
      titleBefore: string;
      titleHighlight: string;
      paragraphs: string[];
      pullQuote: string;
      founderRole: string;
      coFounderRole: string;
      avatarAlt: string;
    };
    matchmaking: {
      title: string;
      subtitle: string;
      points: { title: string; body: string }[];
    };
    lobby: {
      statusHeader: string;
      statusUnbalanced: string;
      statusBalancing: string;
      statusBalanced: string;
      liveBalanced: string;
      liveBalancing: string;
      liveUnbalanced: string;
      teamAlpha: string;
      teamBeta: string;
      playersAria: string;
      balanceScore: string;
      rebalance: string;
      footnote: string;
    };
    experience: {
      title: string;
      previewNote: string;
      steps: { title: string; body: string; detail: string[] }[];
    };
    discordCta: { title: string; body: string; button: string; note: string };
    faq: { title: string; subtitle: string; items: { q: string; a: string }[] };
  };
  leaderboard: {
    eyebrow: string;
    titleBefore: string;
    titleHighlight: string;
    subtitle: string;
    statusLoading: string;
    statusLive: string;
    statusReconnecting: string;
    statusError: string;
    updatedPrefix: string;
    metricHeading: string;
    playersTracked: string;
    metricsAria: string;
    metrics: { rank_points: string; elo: string; win_rate: string };
    tableRank: string;
    tablePlayer: string;
    tableScore: string;
    empty: string;
  };
  match: {
    reportLabel: string;
    vs: string;
    matchIdPrefix: string;
    teamAWins: string;
    teamBWins: string;
    draw: string;
    rostersTitle: string;
    playersCount: string;
    teamA: string;
    teamB: string;
    winner: string;
    mvp: string;
    playersAria: string;
    statsTitle: string;
    statsSubtitle: string;
    balanceScore: string;
    statMatchId: string;
    statStatus: string;
    statType: string;
    statBalanceGap: string;
    relativeJustNow: string;
    relativeMinutes: string;
    relativeHours: string;
    relativeDays: string;
    relativeMonths: string;
  };
  theme: {
    light: string;
    system: string;
    dark: string;
    label: string;
  };
  legalPages: {
    privacyLabel: string;
    privacyTitle: string;
    termsLabel: string;
    termsTitle: string;
    legalNoticeLabel: string;
    legalNoticeTitle: string;
    privacyUpdated: string;
    termsUpdated: string;
    legalNoticeUpdated: string;
    termsFooter: string;
    privacyFooter: string;
  };
};
