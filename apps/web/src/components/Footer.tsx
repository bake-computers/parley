import { Image } from "@unpic/react";
import { Reveal } from "#/components/ui/reveal";
import { homeSectionHref, siteHref, type SitePath } from "#/lib/content/paths";
import { useMessages } from "#/lib/content/messages/use-messages";

// Our discord isnt finished yet, so we're not linking to it
// const DISCORD_INVITE = "https://discord.gg/parley";
const BOT_AUTHORIZE =
  "https://discord.com/oauth2/authorize?client_id=1495122091165618358&permissions=379968&integration_type=0&scope=bot+applications.commands";

const poweredBy = [
  {
    name: "stats.cc",
    href: "https://stats.cc",
    icon: "https://stats.cc/favicon.ico",
  },
];

type FooterLink = {
  label: string;
  href: string;
  external?: boolean;
};

export function SiteFooter() {
  const m = useMessages();

  const productLinks: FooterLink[] = [
    { label: m.footer.home, href: siteHref("") },
    { label: m.nav.matchmaking, href: homeSectionHref("matchmaking") },
    { label: m.nav.experience, href: homeSectionHref("experience") },
    { label: m.nav.faq, href: homeSectionHref("faq") },
  ];

  const resourceLinks: FooterLink[] = [
    { label: m.footer.docs, href: siteHref("docs") },
    { label: m.footer.blog, href: siteHref("blog") },
  ];

  const communityLinks: FooterLink[] = [
    { label: m.nav.joinDiscord, href: BOT_AUTHORIZE, external: true },
    // Our discord isnt finished yet, so we're not linking to it
    // { label: m.footer.discordServer, href: DISCORD_INVITE, external: true },
  ];

  const legalLinks: { label: string; path: SitePath }[] = [
    { label: m.footer.legalNotice, path: "legal-notice" },
    { label: m.footer.privacy, path: "privacy" },
    { label: m.footer.terms, path: "terms" },
  ];

  const columns: { label: string; links: FooterLink[] }[] = [
    { label: m.footer.productGroup, links: productLinks },
    { label: m.nav.resources, links: resourceLinks },
    { label: m.footer.communityGroup, links: communityLinks },
    {
      label: m.footer.legalGroup,
      links: legalLinks.map((link) => ({
        label: link.label,
        href: siteHref(link.path),
      })),
    },
  ];

  return (
    <footer className="parley-footer relative overflow-hidden px-6 pb-10 pt-16 md:pb-12 md:pt-24">
      <Reveal direction="up" className="relative z-10 mx-auto w-full max-w-6xl">
        <div className="grid gap-12 lg:grid-cols-[auto_1fr] lg:gap-16">
          <div className="flex flex-col gap-5 lg:max-w-[12rem]">
            <a
              href={siteHref("")}
              className="inline-flex w-fit items-center gap-3 rounded-xl transition-opacity hover:opacity-80"
            >
              <Image
                src="/parley-logo.svg"
                alt="Parley logo"
                width={36}
                height={36}
                className="size-9"
              />
              <span className="text-lg font-semibold tracking-tight text-foreground">
                {m.nav.brand}
              </span>
            </a>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {m.footer.notUbisoft}
              <br />
              {m.footer.notDiscord}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-10 sm:grid-cols-4 sm:gap-x-6 lg:gap-x-10">
            {columns.map((column) => (
              <nav key={column.label} aria-label={column.label} className="flex flex-col gap-3.5">
                <span className="text-xs font-medium text-muted-foreground/70">{column.label}</span>
                <ul className="flex flex-col gap-2.5">
                  {column.links.map((link) => (
                    <li key={link.href + link.label}>
                      <a
                        href={link.href}
                        className="parley-footer-link text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
                        {...(link.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </div>

        <div className="relative mt-16 min-h-[4.5rem] sm:mt-20 sm:min-h-[6.5rem] md:min-h-[8rem]">
          <p className="parley-footer-mark" aria-hidden="true">
            {m.nav.brand}
          </p>
        </div>

        <div className="mt-6 flex flex-col gap-5 border-t border-border/30 pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} {m.nav.brand}
            <span className="mx-2 text-border" aria-hidden="true">
              /
            </span>
            {m.footer.projectOf}
          </p>
          <div className="flex items-center gap-2.5">
            <span className="text-xs text-muted-foreground/70">{m.footer.poweredBy}</span>
            {poweredBy.map((partner) => (
              <a
                key={partner.href}
                href={partner.href}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground"
              >
                <img
                  src={partner.icon}
                  alt=""
                  width={16}
                  height={16}
                  className="size-4 rounded-[4px]"
                  loading="lazy"
                />
                {partner.name}
              </a>
            ))}
          </div>
        </div>
      </Reveal>
    </footer>
  );
}
