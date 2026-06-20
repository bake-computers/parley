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
    <div className="min-h-screen">
      <SiteHeader />
      <main className="py-16 md:py-24">
        <article className="mx-auto w-full max-w-3xl px-6">
          <header className="border-b border-border/30 pb-8 text-center">
            <span className="text-sm font-medium text-muted-foreground">{label}</span>
            <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {title}
            </h1>
            {lastUpdated != null && (
              <p className="mt-3 text-xs text-muted-foreground/60">Last updated: {lastUpdated}</p>
            )}
          </header>

          <div className="mt-10 space-y-10 text-sm leading-relaxed text-muted-foreground">
            {children}
          </div>
        </article>
      </main>
      <SiteFooter />
    </div>
  );
}