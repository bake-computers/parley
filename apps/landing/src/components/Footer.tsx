import { Image } from "@unpic/react";

export function SiteFooter() {
  return (
    <footer className="bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-6 px-6 py-12 sm:flex-row">
        <div className="flex items-center gap-3">
          <Image
            src="/parley-logo.png"
            alt="Parley logo"
            width={28}
            height={28}
            className="size-7"
          />
          <span className="text-sm font-semibold uppercase tracking-[0.2em] text-foreground">
            Parley
          </span>
        </div>

        <p className="text-center text-xs text-muted-foreground sm:text-right">
          Competitive matchmaking & tournaments for Rainbow Six Siege.
          <br className="hidden sm:block" />
          Pre-launch · Discord app first. Not affiliated with Ubisoft.
        </p>

        <span className="text-xs uppercase tracking-widest text-muted-foreground/60">
          © {new Date().getFullYear()} Parley
        </span>
      </div>
    </footer>
  );
}