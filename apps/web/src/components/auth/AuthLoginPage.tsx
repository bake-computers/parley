"use client";

import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      size?: "normal" | "compact" | "flexible";
      theme?: "auto" | "light" | "dark";
      action?: string;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

type AuthLoginPageProps = {
  redirectTo?: string;
  turnstileSiteKey?: string;
  error?: string;
};

function DiscordMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="currentColor"
        d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
      />
    </svg>
  );
}

export function AuthLoginPage({
  redirectTo = "/dashboard",
  turnstileSiteKey = "",
  error,
}: AuthLoginPageProps) {
  const discordHref = `/auth/discord?redirect=${encodeURIComponent(redirectTo)}`;
  const termsHref = "/terms";
  const privacyHref = "/privacy";
  const year = new Date().getFullYear();
  const useTurnstile = turnstileSiteKey.length > 0;
  const [turnstileReady, setTurnstileReady] = useState(false);
  const widgetHostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!useTurnstile || !widgetHostRef.current) {
      return;
    }

    const mount = () => {
      const host = widgetHostRef.current;
      if (!host || !window.turnstile) {
        return;
      }
      if (widgetIdRef.current) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
      setTurnstileReady(false);
      host.replaceChildren();
      widgetIdRef.current = window.turnstile.render(host, {
        sitekey: turnstileSiteKey,
        size: "flexible",
        theme: "auto",
        action: "turnstile-spin-v1",
        callback: () => setTurnstileReady(true),
        "expired-callback": () => setTurnstileReady(false),
        "error-callback": () => setTurnstileReady(false),
      });
    };

    const existing = document.querySelector(`script[src="${TURNSTILE_SCRIPT}"]`);
    if (window.turnstile) {
      mount();
    } else if (existing) {
      existing.addEventListener("load", mount, { once: true });
    } else {
      const script = document.createElement("script");
      script.src = TURNSTILE_SCRIPT;
      script.async = true;
      script.defer = true;
      script.addEventListener("load", mount, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, [useTurnstile, turnstileSiteKey]);

  return (
    <div className="grid min-h-[100dvh] lg:grid-cols-[1.05fr_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[#1c1917] lg:block" aria-hidden>
        <picture>
          <source
            media="(min-width: 1280px)"
            srcSet="/assets/hero/hero-cinematic-1280.webp"
            type="image/webp"
          />
          <img
            src="/assets/hero/hero-cinematic-1280.webp"
            alt=""
            width={1280}
            height={720}
            className="absolute inset-0 h-full w-full object-cover object-[62%_38%] opacity-55"
          />
        </picture>
        <div className="absolute inset-0 bg-[#1c1917]/75" />
        <div className="absolute inset-0 bg-gradient-to-br from-black/50 via-transparent to-black/30" />
        <div className="absolute inset-0 hero-chrome opacity-35" />

        <div className="relative flex h-full flex-col justify-between p-12 xl:p-16">
          <p className="max-w-sm text-sm leading-relaxed text-white/65">
            Competitive matchmaking and tournaments for Rainbow Six Siege, built for Discord
            communities.
          </p>
          <div>
            <h2 className="max-w-lg text-[2.75rem] leading-[1.05] font-semibold tracking-tight text-white xl:text-5xl">
              Manage your
              <br />
              servers
            </h2>
          </div>
        </div>
      </aside>

      <div className="relative flex min-h-[100dvh] flex-col bg-background">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-muted/30 to-transparent lg:hidden" />

        <header className="relative z-10 flex items-center justify-between px-6 py-8 sm:px-10 lg:px-12">
          <Link
            to="/"
            className="inline-flex items-center gap-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <img src="/parley-logo.svg" alt="" width={32} height={32} className="size-8" />
            <span className="text-base font-semibold tracking-tight">Parley</span>
          </Link>
          <Link
            to="/"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            Back to site
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </header>

        <main className="relative z-10 flex flex-1 flex-col justify-center px-6 sm:px-10 lg:px-12">
          <div className="mx-auto w-full max-w-[22rem] motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            <h1 className="text-[2rem] font-semibold tracking-tight sm:text-[2.15rem]">Sign in</h1>
            <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
              Authorize with Discord to access guild settings and matchmaking rules.
            </p>

            {error === "turnstile" ? (
              <p className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Security check failed. Complete the challenge and try again.
              </p>
            ) : null}

            {useTurnstile ? (
              <form
                method="post"
                action="/auth/discord"
                className="mt-10 flex w-full flex-col gap-2"
                onSubmit={(e) => {
                  if (!turnstileReady) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="redirect" value={redirectTo} />
                <button
                  type="submit"
                  disabled={!turnstileReady}
                  aria-disabled={!turnstileReady}
                  className="auth-authorize-btn inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full px-6 text-sm font-medium text-white transition-[transform,filter,opacity] hover:brightness-105 active:scale-[0.99] motion-reduce:active:scale-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale disabled:hover:brightness-100 disabled:active:scale-100"
                >
                  <DiscordMark />
                  Authorize
                  <ArrowRight className="size-4" aria-hidden />
                </button>
                <div ref={widgetHostRef} className="auth-turnstile" />
              </form>
            ) : (
              <a
                href={discordHref}
                className="auth-authorize-btn mt-10 inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full px-6 text-sm font-medium text-white transition-[transform,filter] hover:brightness-105 active:scale-[0.99] motion-reduce:active:scale-100"
              >
                <DiscordMark />
                Authorize
                <ArrowRight className="size-4" aria-hidden />
              </a>
            )}

            <p className="text-muted-foreground mt-8 text-center text-xs leading-relaxed">
              By authorizing, you agree to our{" "}
              <a href={termsHref} className="text-foreground underline-offset-4 hover:underline">
                Terms of Service
              </a>{" "}
              and{" "}
              <a href={privacyHref} className="text-foreground underline-offset-4 hover:underline">
                Privacy Policy
              </a>
              .
            </p>
          </div>
        </main>

        <footer className="relative z-10 flex flex-col gap-3 px-6 py-8 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-12">
          <p>© {year} Parley</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <a href={termsHref} className="hover:text-foreground transition-colors">
              Terms
            </a>
            <a href={privacyHref} className="hover:text-foreground transition-colors">
              Privacy
            </a>
            <Link to="/" className="hover:text-foreground transition-colors">
              Home
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
