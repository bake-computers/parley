import { Image } from "@unpic/react";
import { Reveal } from "#/components/ui/reveal";
import { siteHref, type SitePath } from "#/lib/content/paths";
import { useMessages } from "#/lib/content/messages/use-messages";

const poweredBy = [
  {
    name: "stats.cc",
    href: "https://stats.cc",
    icon: "https://stats.cc/favicon.ico",
  },
];

export function SiteFooter() {
  const m = useMessages();

  const footerLinks: { label: string; path: SitePath }[] = [
    { label: m.footer.leaderboard, path: "leaderboard" },
    { label: m.footer.legalNotice, path: "legal-notice" },
    { label: m.footer.privacy, path: "privacy" },
    { label: m.footer.terms, path: "terms" },
  ];

  return (
    <footer className="px-6 pb-12 pt-8">
      <Reveal
        direction="up"
        className="mx-auto w-full max-w-6xl border-t border-border/30 pt-8"
      >
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-center gap-3">
              <Image
                src="/parley-logo.svg"
                alt="Parley logo"
                width={28}
                height={28}
                className="size-7"
              />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {m.nav.brand}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.footer.notUbisoft}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.footer.notDiscord}
                </p>
                <p className="text-xs text-muted-foreground">
                  {m.footer.projectOf}
                </p>
              </div>
            </div>

            <nav className="flex flex-wrap gap-x-5 gap-y-2">
              {footerLinks.map((link) => (
                <a
                  key={link.path}
                  href={siteHref(link.path)}
                  className="parley-footer-link text-sm text-muted-foreground transition-colors hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/20 pt-6">
            <span className="text-xs font-medium text-muted-foreground/70">
              {m.footer.poweredBy}
            </span>
            {poweredBy.map((partner) => (
              <a
                key={partner.href}
                href={partner.href}
                target="_blank"
                rel="noopener noreferrer"
                className="glass-chip inline-flex items-center gap-2 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
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

          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} Parley
          </p>
        </div>
      </Reveal>
    </footer>
  );
}
