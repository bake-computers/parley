import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { GlassPanel } from "#/components/ui/glass-panel";

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
      <main className="py-20 md:py-28">
        <div className="mx-auto w-full max-w-3xl px-6">
          <GlassPanel className="p-8 md:p-12">
            <div className="text-center">
              <span className="text-sm font-medium text-muted-foreground">{label}</span>
              <h1 className="mt-4 text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                {title}
              </h1>
              {lastUpdated != null && (
                <p className="mt-3 text-xs text-muted-foreground/60">Last updated: {lastUpdated}</p>
              )}
            </div>

            <div className="mt-12 space-y-10 text-sm leading-relaxed text-muted-foreground">
              {children}
            </div>
          </GlassPanel>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}