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
    <footer className="pb-8 pt-12">
      <Reveal direction="up" className="mx-auto w-full max-w-6xl px-6">
        <div className="glass-panel flex flex-col items-center justify-between gap-6 p-8 sm:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/parley-logo.svg"
              alt="Parley logo"
              width={28}
              height={28}
              className="size-7"
            />
            <span className="text-sm font-semibold text-foreground">Parley</span>
          </div>

          <p className="text-center text-xs text-muted-foreground sm:text-right">
            Competitive matchmaking & tournaments for Rainbow Six Siege.
            <br className="hidden sm:block" />
            Pre-launch · Discord app first. Not affiliated with Ubisoft.
          </p>

          <span className="text-xs text-muted-foreground/60">
            © {new Date().getFullYear()} Parley
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="parley-footer-link text-sm text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>
      </Reveal>
    </footer>
  );
}