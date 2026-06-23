"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { ChevronDown, Menu, X } from "lucide-react";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { useScrollSpy } from "#/hooks/useScrollSpy";
import { homeSectionHref, siteHref } from "#/lib/content/paths";
import { useMessages } from "#/lib/content/messages/use-messages";
import { cn } from "#/lib/shared/cn";

const SECTION_IDS = ["matchmaking", "experience"];
const MOBILE_MENU_ID = "parley-mobile-nav";

type NavLink = { label: string; href: string; sectionId: string | null };

function NavResourcesDropdown({
  label,
  items,
  className,
}: {
  label: string;
  items: NavLink[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "parley-nav-link inline-flex items-center gap-1 rounded-full px-3 py-2.5 text-sm font-medium transition-colors",
          open ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="glass-panel absolute top-[calc(100%+0.35rem)] left-1/2 z-50 min-w-[11rem] -translate-x-1/2 rounded-2xl p-1.5 shadow-lg"
        >
          {items.map((item) => (
            <a
              key={item.href}
              role="menuitem"
              href={item.href}
              onClick={() => setOpen(false)}
              className="text-muted-foreground hover:text-foreground block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50"
            >
              {item.label}
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [resourcesOpen, setResourcesOpen] = useState(false);
  const { activeId } = useScrollSpy({ sectionIds: SECTION_IDS });
  const m = useMessages();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const isHome = pathname === "/" || pathname === "";

  const primaryNav: NavLink[] = [
    { label: m.nav.matchmaking, href: homeSectionHref("matchmaking"), sectionId: "matchmaking" },
    { label: m.nav.experience, href: homeSectionHref("experience"), sectionId: "experience" },
  ];

  const resourceNav: NavLink[] = [
    { label: m.nav.problem, href: homeSectionHref("problem"), sectionId: null },
    { label: m.nav.story, href: homeSectionHref("story"), sectionId: null },
    { label: m.nav.leaderboard, href: siteHref("leaderboard"), sectionId: null },
    { label: m.nav.faq, href: homeSectionHref("faq"), sectionId: null },
    { label: m.footer.terms, href: siteHref("terms"), sectionId: null },
    { label: m.footer.privacy, href: siteHref("privacy"), sectionId: null },
    { label: m.footer.legalNotice, href: siteHref("legal-notice"), sectionId: null },
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
            href={siteHref("")}
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
            {primaryNav.map((item) => {
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
            <NavResourcesDropdown label={m.nav.resources} items={resourceNav} />
          </nav>

          <div className="ml-auto flex items-center gap-2">
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

            <Link
              to="/auth/login"
              search={{ redirect: "/dashboard" }}
              className="hidden h-12 min-h-12 shrink-0 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-all hover:scale-[1.02] active:scale-[0.98] sm:inline-flex"
            >
              {m.nav.authorize}
            </Link>
          </div>
        </div>

        <div
          id={MOBILE_MENU_ID}
          className={cn(
            "w-full transition-all duration-300 ease-out md:hidden",
            menuOpen ? "max-h-[28rem] opacity-100" : "max-h-0 overflow-hidden opacity-0",
          )}
        >
          <nav className="glass-panel flex flex-col gap-1 p-2" aria-label="Mobile primary">
            {primaryNav.map((item) => {
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
            <button
              type="button"
              aria-expanded={resourcesOpen}
              onClick={() => setResourcesOpen((v) => !v)}
              className="text-muted-foreground flex min-h-12 items-center justify-between rounded-xl px-4 py-3 text-sm font-medium transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {m.nav.resources}
              <ChevronDown
                className={cn("size-4 transition-transform", resourcesOpen && "rotate-180")}
                aria-hidden
              />
            </button>
            {resourcesOpen
              ? resourceNav.map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      setMenuOpen(false);
                      setResourcesOpen(false);
                    }}
                    className="text-muted-foreground min-h-11 rounded-xl py-2.5 pr-4 pl-8 text-sm transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    {item.label}
                  </a>
                ))
              : null}
            <div className="border-t border-border/60 px-2 pt-2">
              <ThemeToggle />
            </div>
            <Link
              to="/auth/login"
              search={{ redirect: "/dashboard" }}
              onClick={() => setMenuOpen(false)}
              className="mt-1 flex min-h-12 items-center justify-center rounded-full bg-foreground px-4 py-3 text-center text-sm font-medium text-background"
            >
              {m.nav.authorize}
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}