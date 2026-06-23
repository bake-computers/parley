import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";

import { CookieBanner } from "#/components/CookieBanner";
import appCss from "../styles.css?url";

import criticalCss from "../critical.css?raw";

const SITE_TITLE = "Parley — Competitive Matchmaking & Tournaments for Rainbow Six Siege";
const SITE_DESCRIPTION =
  "Parley is a competitive matchmaking and tournament platform for Rainbow Six Siege. Skill-and-telemetry-based matchmaking, automated team formation, scrims, and brackets. Discord app first — join the waitlist.";
const SITE_URL = "https://parley.bot";
const OG_IMAGE = "/assets/parley-banner.png";
const GEIST_SANS = "/assets/fonts/Geist-Variable.woff2";
const HERO_PRELOAD = "/assets/hero/hero-cinematic-768.webp";

const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem('parley_cookie_consent');var p=false;if(c){var j=JSON.parse(c);p=j&&j.version==='v1'&&j.preferences===true}var d;if(p){var t=localStorage.getItem('parley-theme');d=t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme:dark)').matches)}else{d=matchMedia('(prefers-color-scheme:dark)').matches}document.documentElement.classList.toggle('dark',d)}catch(e){}})()`;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: SITE_TITLE },
      { name: "description", content: SITE_DESCRIPTION },
      { property: "og:title", content: SITE_TITLE },
      { property: "og:description", content: SITE_DESCRIPTION },
      { property: "og:url", content: SITE_URL },
      { property: "og:image", content: OG_IMAGE },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "Parley" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: SITE_TITLE },
      { name: "twitter:description", content: SITE_DESCRIPTION },
      { name: "twitter:image", content: OG_IMAGE },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "48x48" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-icon-180x180.png" },
      { rel: "apple-touch-icon", sizes: "152x152", href: "/apple-icon-152x152.png" },
      { rel: "apple-touch-icon", sizes: "120x120", href: "/apple-icon-120x120.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
        <link
          rel="preload"
          href={GEIST_SANS}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href={HERO_PRELOAD}
          as="image"
          type="image/webp"
          fetchPriority="high"
          media="(max-width: 767px)"
        />
        <link
          rel="preload"
          href="/assets/hero/hero-cinematic-1280.webp"
          as="image"
          type="image/webp"
          fetchPriority="high"
          media="(min-width: 768px)"
        />
        <link rel="preload" href={appCss} as="style" />
        <link rel="stylesheet" href={appCss} />
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <div aria-hidden="true" className="ambient-bg fixed inset-0 -z-10" />
        {children}
        <CookieBanner />
        {import.meta.env.DEV ? (
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}