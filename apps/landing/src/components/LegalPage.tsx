import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";

interface LegalPageProps {
  label: string;
  title: string;
  lastUpdated?: string;
  children: React.ReactNode;
}

export function LegalPage({ label, title, lastUpdated, children }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <main>
        <section className="border-b border-border/60">
          <div className="mx-auto w-full max-w-3xl px-6 py-20 md:py-28">
            <div className="text-center">
              <span className="text-xs uppercase tracking-[0.25em] text-muted-foreground">
                {label}
              </span>
              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {title}
              </h1>
              {lastUpdated != null && (
                <p className="mt-3 text-xs text-muted-foreground/60">
                  Last updated: {lastUpdated}
                </p>
              )}
            </div>

            <div className="mt-12 space-y-10 text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
