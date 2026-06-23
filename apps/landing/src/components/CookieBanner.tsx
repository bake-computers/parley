"use client";

import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { hasConsent, writeConsent } from "#/lib/consent/cookies";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasConsent());
  }, []);

  if (!visible) {
    return null;
  }

  const accept = (preferences: boolean) => {
    writeConsent(preferences);
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-banner-title"
      aria-describedby="cookie-banner-desc"
      className="fixed inset-x-0 bottom-0 z-50 p-4 sm:p-6"
    >
      <div className="glass-panel mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
        <div className="min-w-0 flex-1">
          <p id="cookie-banner-title" className="text-sm font-medium">
            Cookies &amp; storage
          </p>
          <p id="cookie-banner-desc" className="text-muted-foreground mt-1 text-sm leading-relaxed">
            We use essential cookies to keep you signed in to the dashboard via Discord OAuth. With
            your permission, we also store your theme preference locally. We do not use marketing or
            analytics cookies.{" "}
            <a href="/privacy" className="text-foreground underline-offset-4 hover:underline">
              Privacy policy
            </a>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2 sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => accept(false)}>
            Essential only
          </Button>
          <Button type="button" size="sm" onClick={() => accept(true)}>
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}