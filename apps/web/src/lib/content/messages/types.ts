export type Messages = {
  nav: {
    problem: string;
    story: string;
    matchmaking: string;
    experience: string;
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
