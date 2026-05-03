import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    title: "Parley — Competitive Siege, Made Simple",
    meta: [
      {
        name: "description",
        content:
          "Parley is a competitive gaming Discord bot for Rainbow Six Siege. Track ELO, build balanced teams, queue cross-server matchmaking, and run tournaments.",
      },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0d0e10" },
      { property: "og:title", content: "Parley — Competitive Siege, Made Simple" },
      {
        property: "og:description",
        content:
          "Parley is a competitive gaming Discord bot for Rainbow Six Siege. Track ELO, build balanced teams, queue cross-server matchmaking, and run tournaments.",
      },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://cdn.parley.bot/parley-banner.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Parley — Competitive Siege, Made Simple" },
      {
        name: "twitter:description",
        content:
          "Parley is a competitive gaming Discord bot for Rainbow Six Siege. Track ELO, build balanced teams, queue cross-server matchmaking, and run tournaments.",
      },
      { name: "twitter:image", content: "https://cdn.parley.bot/parley-banner.png" },
    ],
    links: [
      {
        rel: "icon",
        type: "image/png",
        sizes: "32x32",
        href: "/favicon-32x32.png",
      },
      {
        rel: "icon",
        type: "image/png",
        sizes: "16x16",
        href: "/favicon-16x16.png",
      },
      {
        rel: "apple-touch-icon",
        sizes: "180x180",
        href: "/apple-icon.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background font-sans text-foreground antialiased">
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
