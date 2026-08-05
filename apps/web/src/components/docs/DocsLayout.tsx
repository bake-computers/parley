import type { ReactNode } from "react";
import { SiteHeader } from "#/components/Header";
import { SiteFooter } from "#/components/Footer";
import { DOC_GROUPS, docHref } from "#/lib/docs/manifest";
import { cn } from "#/lib/shared/cn";

function SidebarNav({ activeSlug }: { activeSlug: string | null }) {
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      {DOC_GROUPS.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground/60">
            {group.label}
          </p>
          <ul className="mt-2 flex flex-col gap-0.5">
            {group.pages.map((page) => {
              const isActive = page.slug === activeSlug;
              return (
                <li key={page.slug}>
                  <a
                    href={docHref(page.slug)}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "block rounded-lg px-3 py-1.5 text-sm transition-colors",
                      isActive
                        ? "bg-muted/70 font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
                    )}
                  >
                    {page.title}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

interface DocsLayoutProps {
  activeSlug: string | null;
  children: ReactNode;
}

export function DocsLayout({ activeSlug, children }: DocsLayoutProps) {
  return (
    <div className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto w-full max-w-6xl px-6 pt-10 pb-16 md:pt-14 md:pb-24">
        <div className="grid gap-8 md:grid-cols-[14.5rem_minmax(0,1fr)] md:gap-10 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <aside className="docs-sidebar min-w-0 md:sticky md:top-24 md:max-h-[calc(100vh-7rem)] md:self-start md:overflow-y-auto md:pr-2">
            <details className="glass-panel group/sidebar mb-6 rounded-2xl p-2 md:hidden" open={false}>
              <summary className="flex min-h-11 cursor-pointer items-center justify-between px-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
                Browse docs
                <span className="text-xs text-muted-foreground transition-transform group-open/sidebar:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="px-1 pt-3 pb-2">
                <SidebarNav activeSlug={activeSlug} />
              </div>
            </details>
            <div className="hidden md:block">
              <SidebarNav activeSlug={activeSlug} />
            </div>
          </aside>
          <div className="min-w-0">{children}</div>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}

interface DocsArticleProps {
  title: string;
  description: string;
  children: ReactNode;
}

/** Page header + prose body used by every docs page. */
export function DocsArticle({ title, description, children }: DocsArticleProps) {
  return (
    <article className="max-w-3xl">
      <header className="border-b border-border/30 pb-6">
        <h1 className="text-balance text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
          {title}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-base">{description}</p>
      </header>
      <div className="docs-prose pt-2">{children}</div>
    </article>
  );
}
