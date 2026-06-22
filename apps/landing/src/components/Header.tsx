"use client";

import { useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { Menu, X } from "lucide-react";
import { LocaleSwitch } from "#/components/LocaleSwitch";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { useScrollSpy } from "#/hooks/useScrollSpy";
import { homeSectionHref, localizedHref } from "#/lib/i18n";
import { useLocale } from "#/lib/locale-messages-context";
import { cn } from "#/lib/utils";

const DISCORD_URL = "https://discord.gg/parley";

const SECTION_IDS = ["problem", "story", "matchmaking", "experience", "discord", "faq"];
const MOBILE_MENU_ID = "parley-mobile-nav";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { activeId } = useScrollSpy({ sectionIds: SECTION_IDS });
  const { locale, m } = useLocale();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isHome = pathname === `/${locale}` || pathname === `/${locale}/`;
  const discordHref = isHome ? "#discord" : DISCORD_URL;
  const discordExternal = discordHref.startsWith("http");

  const navItems = [
    { label: m.nav.problem, href: homeSectionHref(locale, "problem"), sectionId: "problem" },
    { label: m.nav.story, href: homeSectionHref(locale, "story"), sectionId: "story" },
    { label: m.nav.matchmaking, href: homeSectionHref(locale, "matchmaking"), sectionId: "matchmaking" },
    { label: m.nav.experience, href: homeSectionHref(locale, "experience"), sectionId: "experience" },
    { label: m.nav.leaderboard, href: localizedHref(locale, "leaderboard"), sectionId: null },
    { label: m.nav.faq, href: homeSectionHref(locale, "faq"), sectionId: "faq" },
  ];

  return (
    <header
      className={cn(
        "z-50 px-4 md:px-6",
        isHome ? "fixed inset-x-0 top-4" : "sticky top-4",
      )}
    >
      <div className="mx-auto max-w-5xl">
        <div className="glass-pill flex w-full items-center gap-2 px-2 py-2 md:gap-3 md:px-3">
          <a
            href={localizedHref(locale, "")}
            className="flex shrink-0 items-center gap-2 rounded-full px-2 py-1.5 transition-colors hover:bg-muted/50"
          >
            <Image
              src="/parley-logo.svg"
              alt="Parley logo"
              width={28}
              height={28}
              className="size-7"
            />
            <span className="hidden text-sm font-semibold text-foreground sm:inline">{m.nav.brand}</span>
          </a>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary">
            {navItems.map((item) => {
              const isActive = item.sectionId !== null && activeId === item.sectionId;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "parley-nav-link rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "parley-nav-active text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LocaleSwitch className="hidden sm:flex" />
            <ThemeToggle className="hidden lg:flex" />

            <button
              type="button"
              className="flex size-12 min-h-12 min-w-12 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground md:hidden"
              aria-expanded={menuOpen}
              aria-controls={MOBILE_MENU_ID}
              aria-label={menuOpen ? m.nav.closeMenu : m.nav.openMenu}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <X className="size-4" aria-hidden="true" />
              ) : (
                <Menu className="size-4" aria-hidden="true" />
              )}
            </button>

            <a
              href={discordHref}
              {...(discordExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              className="hidden h-12 min-h-12 shrink-0 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-all hover:scale-[1.02] active:scale-[0.98] sm:inline-flex"
            >
              {m.nav.joinDiscord}
            </a>
          </div>
        </div>

        <div
          id={MOBILE_MENU_ID}
          className={cn(
            "w-full transition-all duration-300 ease-out md:hidden",
            menuOpen ? "max-h-96 opacity-100" : "max-h-0 overflow-hidden opacity-0",
          )}
        >
          <nav className="glass-panel flex flex-col gap-1 p-2" aria-label="Mobile primary">
            <div className="px-2 pb-2 sm:hidden">
              <LocaleSwitch className="w-full justify-center" />
            </div>
            {navItems.map((item) => {
              const isActive = item.sectionId !== null && activeId === item.sectionId;
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className={cn(
                    "min-h-12 rounded-xl px-4 py-3 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-accent-silver/10 text-foreground"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {item.label}
                </a>
              );
            })}
            <div className="border-t border-border/60 px-2 pt-2">
              <ThemeToggle />
            </div>
            <a
              href={discordHref}
              {...(discordExternal ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              onClick={() => setMenuOpen(false)}
              className="mt-1 flex min-h-12 items-center justify-center rounded-full bg-foreground px-4 py-3 text-center text-sm font-medium text-background"
            >
              {m.nav.joinDiscord}
            </a>
          </nav>
        </div>
      </div>
    </header>
  );
}