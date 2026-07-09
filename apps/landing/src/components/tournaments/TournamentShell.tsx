import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
import { cn } from "#/lib/shared/cn";

type TournamentShellProps = {
  children: React.ReactNode;
  /** Optional hero block rendered above the main content (inside the backdrop section). */
  hero?: React.ReactNode;
  className?: string;
  contentClassName?: string;
};

export function TournamentShell({
  children,
  hero,
  className,
  contentClassName,
}: TournamentShellProps) {
  return (
    <div className={cn("min-h-screen", className)}>
      <SiteHeader />
      <main>
        {hero ? (
          <section className="relative overflow-hidden py-16 md:py-24">
            <SectionBackdrop glow="center" />
            <div className="relative mx-auto w-full max-w-6xl px-6">{hero}</div>
          </section>
        ) : null}
        <section className={cn(hero ? "pb-16 md:pb-24" : "py-16 md:py-24")}>
          <div className={cn("mx-auto w-full max-w-6xl px-6", contentClassName)}>{children}</div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}

type TournamentHeroProps = {
  eyebrow: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  meta?: React.ReactNode;
};

export function TournamentHero({ eyebrow, title, description, meta }: TournamentHeroProps) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <span className="text-sm font-medium text-muted-foreground">{eyebrow}</span>
        <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-5xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-4 max-w-xl text-pretty text-sm leading-relaxed text-muted-foreground md:text-base">
            {description}
          </p>
        ) : null}
      </div>
      {meta ? <div className="self-start md:self-auto">{meta}</div> : null}
    </div>
  );
}
