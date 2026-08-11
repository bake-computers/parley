import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { SectionBackdrop } from "#/components/ui/section-backdrop";
import { cn } from "#/lib/shared/cn";

type ProfileShellProps = {
  children: React.ReactNode;
  hero?: React.ReactNode;
  className?: string;
};

export function ProfileShell({ children, hero, className }: ProfileShellProps) {
  return (
    <div className={cn("min-h-screen", className)}>
      <SiteHeader />
      <main>
        {hero ? (
          <section className="relative overflow-hidden py-12 md:py-16">
            <SectionBackdrop glow="center" />
            <div className="relative mx-auto w-full max-w-5xl px-6">{hero}</div>
          </section>
        ) : null}
        <section className={cn(hero ? "pb-16 md:pb-24" : "py-16 md:pb-24")}>
          <div className="mx-auto w-full max-w-5xl px-6">{children}</div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
