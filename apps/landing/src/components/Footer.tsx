import { Image } from "@unpic/react";
import { Reveal } from "#/components/ui/reveal";

const footerLinks = [
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Legal notice", href: "/legal-notice" },
  { label: "Privacy policy", href: "/privacy" },
  { label: "Terms of service", href: "/terms" },
];

export function SiteFooter() {
  return (
    <footer className="px-6 pb-12 pt-8">
      <Reveal direction="up" className="mx-auto flex w-full max-w-6xl flex-col gap-8 border-t border-border/30 pt-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Image
            src="/parley-logo.svg"
            alt="Parley logo"
            width={28}
            height={28}
            className="size-7"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">Parley</p>
            <p className="text-xs text-muted-foreground">Not affiliated with Ubisoft</p>
          </div>
        </div>

        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="parley-footer-link text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <p className="text-xs text-muted-foreground/60">
          © {new Date().getFullYear()} Parley
        </p>
      </Reveal>
    </footer>
  );
}