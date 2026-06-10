"use client";

import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { Menu, X } from "lucide-react";
import { PreLaunchBanner } from "#/components/PreLaunchBanner";
import { useScrollSpy } from "#/hooks/useScrollSpy";
import { cn } from "#/lib/utils";

const DISCORD_URL = "https://discord.gg/parley";

const navItems = [
  { label: "The Problem", href: "/#problem", sectionId: "problem" },
  { label: "Matchmaking", href: "/#matchmaking", sectionId: "matchmaking" },
  { label: "How it works", href: "/#experience", sectionId: "experience" },
  { label: "Leaderboard", href: "/leaderboard", sectionId: null },
  { label: "FAQ", href: "/#faq", sectionId: "faq" },
];

const SECTION_IDS = ["problem", "matchmaking", "experience", "discord", "faq"];
const MOBILE_MENU_ID = "parley-mobile-nav";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { activeId, scrolled } = useScrollSpy({ sectionIds: SECTION_IDS });
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const discordHref = pathname === "/" ? "#discord" : DISCORD_URL;
  const discordExternal = discordHref.startsWith("http");

  const cellBg = scrolled ? "bg-background/95" : "bg-background/90";

  return (
    <header className="sticky top-0 z-50">
      <PreLaunchBanner />

      <div className="border-b border-border/60 bg-background/50 backdrop-blur-sm">
        <div className="mx-auto max-w-6xl px-6 py-3">
          <div className="flex gap-px bg-border/60">
            <a
              href="/"
              className={cn(
                "parley-rail-cell parley-bracket-corners-left flex shrink-0 items-center gap-2.5",
                cellBg,
                scrolled && "parley-bracket-corners-bright",
              )}
            >
              <Image
                src="/parley-logo.svg"
                alt="Parley logo"
                width={28}
                height={28}
                className="size-7"
              />
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground">
                Parley
              </span>
            </a>

            <nav className="hidden min-w-0 flex-1 gap-px bg-border/60 md:flex" aria-label="Primary">
              {navItems.map((item) => {
                const isActive = item.sectionId !== null && activeId === item.sectionId;
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "parley-rail-cell parley-nav-link flex flex-1 items-center justify-center text-center",
                      cellBg,
                      isActive && "parley-rail-cell-active parley-nav-active text-foreground",
                      !isActive && "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    <span className="text-[10px] uppercase tracking-[0.14em]">{item.label}</span>
                  </a>
                );
              })}
            </nav>

            <button
              type="button"
              className={cn(
                "parley-rail-cell flex flex-1 items-center justify-center gap-2 md:hidden",
                cellBg,
              )}
              aria-expanded={menuOpen}
              aria-controls={MOBILE_MENU_ID}
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X className="size-4 text-foreground" aria-hidden="true" />
              ) : (
                <Menu className="size-4 text-foreground" aria-hidden="true" />
              )}
              <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
                {menuOpen ? "Close" : "Menu"}
              </span>
            </button>

            <a
              href={discordHref}
              {...(discordExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className={cn(
                "parley-rail-cell parley-bracket-corners-right flex shrink-0 items-center justify-center",
                "bg-foreground text-background transition-colors hover:bg-foreground/90",
                scrolled && "parley-bracket-corners-bright",
              )}
            >
              <span className="text-[10px] font-medium uppercase tracking-[0.14em]">
                Join Discord
              </span>
            </a>
          </div>

          <div
            id={MOBILE_MENU_ID}
            className={cn(
              "grid transition-all duration-300 ease-out md:hidden",
              menuOpen ? "mt-px grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
            )}
          >
            <div className="overflow-hidden">
              <nav className="flex flex-col gap-px bg-border/60" aria-label="Mobile primary">
                {navItems.map((item) => {
                  const isActive = item.sectionId !== null && activeId === item.sectionId;
                  return (
                    <a
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        "parley-rail-cell parley-nav-link px-5 py-3",
                        cellBg,
                        isActive && "parley-rail-cell-active parley-nav-active text-foreground",
                        !isActive && "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      <span className="text-[10px] uppercase tracking-[0.14em]">{item.label}</span>
                    </a>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
