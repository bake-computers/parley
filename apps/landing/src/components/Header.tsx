"use client";

import { useEffect, useRef, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Image } from "@unpic/react";
import { ChevronDown, Menu, X } from "lucide-react";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { clearAuthMeCache, useAuthMe } from "#/hooks/useAuthMe";
import { useScrollSpy } from "#/hooks/useScrollSpy";
import { homeSectionHref, siteHref } from "#/lib/content/paths";
import { useMessages } from "#/lib/content/messages/use-messages";
import { discordAvatarUrl } from "#/lib/discord/oauth";
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

const profileMenuItemClass =
  "text-muted-foreground hover:text-foreground block rounded-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50";

function HeaderProfileMenu({
  className,
  onNavigate,
  layout = "dropdown",
}: {
  className?: string;
  onNavigate?: () => void;
  layout?: "dropdown" | "stack";
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { me } = useAuthMe();
  const m = useMessages();

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

  if (!me) {
    return null;
  }

  const displayName = me.user.globalName ?? me.user.username;
  const avatar = discordAvatarUrl(me.user.id, me.user.avatar);

  const close = () => {
    setOpen(false);
    onNavigate?.();
  };

  const signOut = () => {
    clearAuthMeCache();
    close();
  };

  if (layout === "stack") {
    return (
      <div className={cn("mt-1 flex flex-col gap-1", className)}>
        <div className="flex items-center gap-2.5 px-4 py-2">
          <img
            src={avatar}
            alt=""
            width={32}
            height={32}
            className="size-8 shrink-0 rounded-full ring-1 ring-border"
          />
          <span className="truncate text-sm font-medium text-foreground">{displayName}</span>
        </div>
        <Link
          to="/dashboard"
          onClick={close}
          className="text-muted-foreground min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {m.nav.dashboard}
        </Link>
        <Link
          to="/dashboard/account"
          onClick={close}
          className="text-muted-foreground min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {m.nav.account}
        </Link>
        <a
          href="/auth/logout"
          onClick={signOut}
          className="text-muted-foreground min-h-11 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50 hover:text-foreground"
        >
          {m.nav.signOut}
        </a>
      </div>
    );
  }

  return (
    <div ref={rootRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={displayName}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "group relative flex size-12 min-h-12 min-w-12 shrink-0 items-center justify-center rounded-full transition-colors",
          open
            ? "bg-muted/50 text-foreground"
            : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        )}
      >
        <img
          src={avatar}
          alt=""
          width={32}
          height={32}
          className={cn(
            "size-8 rounded-full ring-2 ring-transparent transition-[box-shadow,ring-color] group-hover:ring-border/50",
            open && "ring-border",
          )}
        />
      </button>
      {open ? (
        <div
          role="menu"
          className="glass-panel absolute top-[calc(100%+0.35rem)] right-0 z-50 min-w-[11rem] rounded-2xl p-1.5 shadow-lg"
        >
          <Link to="/dashboard" role="menuitem" onClick={close} className={profileMenuItemClass}>
            {m.nav.dashboard}
          </Link>
          <Link to="/dashboard/account" role="menuitem" onClick={close} className={profileMenuItemClass}>
            {m.nav.account}
          </Link>
          <a href="/auth/logout" role="menuitem" onClick={signOut} className={profileMenuItemClass}>
            {m.nav.signOut}
          </a>
        </div>
      ) : null}
    </div>
  );
}

function HeaderAuthButton({
  className,
  onNavigate,
  layout = "dropdown",
}: {
  className?: string;
  onNavigate?: () => void;
  layout?: "dropdown" | "stack";
}) {
  const { me } = useAuthMe();
  const m = useMessages();

  if (me === undefined) {
    return null;
  }

  if (me) {
    return <HeaderProfileMenu className={className} onNavigate={onNavigate} layout={layout} />;
  }

  return (
    <Link
      to="/auth/login"
      search={{ redirect: "/dashboard" }}
      onClick={onNavigate}
      className={cn(
        "inline-flex h-12 min-h-12 shrink-0 items-center rounded-full bg-foreground px-5 text-sm font-medium text-background transition-all hover:scale-[1.02] active:scale-[0.98]",
        className,
      )}
    >
      {m.nav.authorize}
    </Link>
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

            <HeaderAuthButton className="hidden sm:inline-flex" />
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
            <HeaderAuthButton
              layout="stack"
              className="mt-1 w-full justify-center"
              onNavigate={() => setMenuOpen(false)}
            />
          </nav>
        </div>
      </div>
    </header>
  );
}