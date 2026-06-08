import { Image } from "@unpic/react";
import { Button } from "@/components/ui/button";

const navItems = [
  { label: "The Problem", href: "/#problem" },
  { label: "Matchmaking", href: "/#matchmaking" },
  { label: "How it works", href: "/#experience" },
  { label: "Leaderboard", href: "/leaderboard" },
  { label: "FAQ", href: "/#faq" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
        <a href="/" className="flex items-center gap-3">
          <Image
            src="/parley-logo.svg"
            alt="Parley logo"
            width={32}
            height={32}
            className="size-8"
          />
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
            Parley
          </span>
        </a>

        <nav className="hidden items-center gap-8 md:flex" aria-label="Primary">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="text-xs uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
            >
              {item.label}
            </a>
          ))}
        </nav>

        <Button size="sm" className="bg-foreground text-background hover:bg-foreground/90">
          <a href="#discord">Join Discord</a>
        </Button>
      </div>
    </header>
  );
}
