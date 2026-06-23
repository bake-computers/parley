export type Founder = {
  id: string;
  handle: string;
  role: "Founder" | "Co-founder";
  avatarSrc: string;
};

export const founders: readonly Founder[] = [
  {
    id: "980859238630948886",
    handle: "ryzm",
    role: "Founder",
    avatarSrc: "/assets/founders/ryzm.webp",
  },
  {
    id: "1019159791886671872",
    handle: "Damon",
    role: "Co-founder",
    avatarSrc: "/assets/founders/co-founder.webp",
  },
] as const;
