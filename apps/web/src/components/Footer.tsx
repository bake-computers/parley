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
    { label: m.footer.legalNotice, path: "legal-notice" },
    { label: m.footer.privacy, path: "privacy" },
    { label: m.footer.terms, path: "terms" },
  ];

  const linkClass =
    "parley-footer-link text-sm text-muted-foreground transition-colors duration-200 hover:text-foreground";

  return (
    <footer className="px-6 pb-12 pt-16 md:pt-20">
      <Reveal direction="up" className="mx-auto w-full max-w-6xl border-t border-border/40 pt-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr] md:gap-8">
          <div className="max-w-sm">
            <div className="flex items-center gap-3">
              <Image
                src="/parley-logo.svg"
                alt="Parley logo"
                width={32}
                height={32}
                className="size-8"
              />
              <span className="text-lg font-semibold tracking-tight text-foreground">
                {m.nav.brand}
              </span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              {m.footer.notUbisoft}
              <br />
              {m.footer.notDiscord}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:gap-10">
            <nav aria-label={m.nav.resources} className="flex flex-col gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
                {m.nav.resources}
              </span>
              <a href={siteHref("docs")} className={linkClass}>
                {m.footer.docs}
              </a>
              <a href={siteHref("blog")} className={linkClass}>
                {m.footer.blog}
              </a>
            </nav>
            <nav aria-label={m.footer.legalGroup} className="flex flex-col gap-3">
              <span className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
                {m.footer.legalGroup}
              </span>
              {footerLinks.map((link) => (
                <a key={link.path} href={siteHref(link.path)} className={linkClass}>
                  {link.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="mt-12 flex flex-col gap-5 border-t border-border/30 pt-7 sm:flex-row sm:items-center sm:justify-between">
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
          <p className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} {m.nav.brand}
            <span className="mx-2 text-border" aria-hidden="true">
              /
            </span>
            {m.footer.projectOf}
          </p>
        </div>
      </Reveal>
    </footer>
  );
}
