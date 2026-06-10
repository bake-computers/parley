import { Image } from "@unpic/react";
import { Reveal } from "#/components/ui/reveal";

const footerLinks = [
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "Legal Notice", href: "/legal-notice" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
];

export function SiteFooter() {
  return (
    <footer className="bg-background">
      <Reveal direction="up" className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <Image
              src="/parley-logo.svg"
              alt="Parley logo"
              width={28}
              height={28}
              className="size-7"
            />
            <span className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
              Parley
            </span>
          </div>

          <p className="text-center text-xs text-muted-foreground sm:text-right">
            Competitive matchmaking & tournaments for Rainbow Six Siege.
            <br className="hidden sm:block" />
            Pre-launch · Discord app first. Not affiliated with Ubisoft.
          </p>

          <span className="text-xs uppercase tracking-widest text-muted-foreground/60">
            © {new Date().getFullYear()} Parley
          </span>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-border/60 pt-6">
          {footerLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="parley-footer-link text-xs uppercase tracking-widest text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              {link.label}
            </a>
          ))}
        </div>
      </Reveal>
    </footer>
  );
}
