import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { Button } from "@/components/ui/button";

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SiteHeader />
      <main className="flex flex-1 items-center justify-center border-b border-border/60">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center px-6 py-20 text-center">
          <img
            src="/parley-logo.svg"
            alt="Parley logo"
            width={64}
            height={64}
            className="mb-8 size-16 opacity-50"
          />

          <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Error 404
          </span>

          <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
            Page not found.
          </h1>

          <p className="mt-4 max-w-md text-pretty leading-relaxed text-muted-foreground">
            The page you&rsquo;re looking for doesn&rsquo;t exist or has been moved. If you believe
            this is an error, reach out on Discord.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <Button
              size="lg"
              className="bg-foreground text-background transition-transform hover:-translate-y-0.5 hover:bg-foreground/90"
            >
              <a href="/">Back to home</a>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-border/70 bg-transparent text-foreground transition-transform hover:-translate-y-0.5 hover:bg-secondary/50"
            >
              <a href="https://discord.gg/parley" target="_blank" rel="noopener noreferrer">
                Join Discord
              </a>
            </Button>
          </div>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
