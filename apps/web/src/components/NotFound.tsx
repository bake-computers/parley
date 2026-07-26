import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { Button } from "#/components/ui/button";
import { GlassPanel } from "#/components/ui/glass-panel";
import { siteHref } from "#/lib/content/paths";
import { useMessages } from "#/lib/content/messages/use-messages";

export function NotFound() {
  const m = useMessages();

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center px-6 py-20">
        <GlassPanel className="mx-auto flex w-full max-w-lg flex-col items-center p-10 text-center">
          <img
            src="/parley-logo.svg"
            alt="Parley logo"
            width={64}
            height={64}
            className="mb-8 size-16 opacity-50"
          />

          <span className="text-sm font-medium text-muted-foreground">{m.notFound.label}</span>

          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            {m.notFound.title}
          </h1>

          <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
            {m.notFound.body}
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="rounded-full bg-foreground text-background transition-all hover:scale-[1.02] hover:bg-foreground/90 active:scale-[0.98]"
            >
              <a href={siteHref("")}>{m.notFound.home}</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="rounded-full border-border/70 bg-transparent text-foreground transition-all hover:scale-[1.02] hover:bg-secondary/50 active:scale-[0.98]"
            >
              <a href="https://discord.gg/parley" target="_blank" rel="noopener noreferrer">
                {m.notFound.discord}
              </a>
            </Button>
          </div>
        </GlassPanel>
      </main>
      <SiteFooter />
    </div>
  );
}
