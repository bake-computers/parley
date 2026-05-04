import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, ExternalLink } from "lucide-react";
import { Button } from "./ui/button";

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50">
      <div className="depth-panel border-b border-white/5">
        <div className="lp-container flex items-center justify-between h-14 md:h-16">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <span className="text-lg md:text-xl font-bold tracking-tight gradient-text">
              PARLEY
            </span>
          </Link>

          <div className="hidden md:flex items-center gap-8">
            <Link
              to="/"
              activeProps={{ className: "text-foreground" }}
              inactiveProps={{
                className: "text-muted-foreground hover:text-foreground transition-colors",
              }}
              className="text-sm font-medium"
            >
              Home
            </Link>
            <Link
              to="/leaderboard"
              activeProps={{ className: "text-foreground" }}
              inactiveProps={{
                className: "text-muted-foreground hover:text-foreground transition-colors",
              }}
              className="text-sm font-medium"
            >
              Leaderboard
            </Link>
          </div>

          <div className="hidden md:block">
            <Button asChild size="sm" variant="default" className="hero-cta-gradient">
              <a
                href="https://discord.com/oauth2/authorize?client_id=PLACEHOLDER"
                target="_blank"
                rel="noopener noreferrer"
                className="gap-1.5"
              >
                Add to Discord
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            className="md:hidden inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden absolute top-full left-0 right-0 border-b border-white/5 depth-panel animate-in slide-in-from-top-2 fade-in duration-200">
          <div className="lp-container py-4 flex flex-col gap-1">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Home
            </Link>
            <Link
              to="/leaderboard"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors"
            >
              Leaderboard
            </Link>
            <div className="mt-2 pt-2 border-t border-white/5">
              <Button asChild size="sm" variant="default" className="w-full hero-cta-gradient">
                <a
                  href="https://discord.com/oauth2/authorize?client_id=PLACEHOLDER"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="gap-1.5"
                >
                  Add to Discord
                  <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
