import { Children, isValidElement, useState, type ReactElement, type ReactNode } from "react";
import {
  ChartLine,
  ChevronDown,
  CircleAlert,
  CirclePlus,
  Info,
  Lightbulb,
  LogIn,
  Medal,
  MessageSquareText,
  Scale,
  TriangleAlert,
  Trophy,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "#/lib/shared/cn";

/** Maps the phosphor icon names used in docs content to installed lucide icons. */
const ICONS: Record<string, LucideIcon> = {
  "ph:chat-circle-text": MessageSquareText,
  "ph:chart-line-up": ChartLine,
  "ph:medal": Medal,
  "ph:plus-circle": CirclePlus,
  "ph:scales": Scale,
  "ph:sign-in": LogIn,
  "ph:trophy": Trophy,
  "ph:trend-up": TrendingUp,
};

interface IconProps {
  icon?: string;
}

function docIcon(icon: string | undefined): LucideIcon {
  return (icon && ICONS[icon]) || Info;
}

const ASIDE_VARIANTS: Record<string, { icon: LucideIcon; className: string; iconClass: string }> = {
  note: { icon: Info, className: "border-border/70", iconClass: "text-muted-foreground" },
  tip: { icon: Lightbulb, className: "border-accent-silver/40", iconClass: "text-foreground" },
  caution: { icon: TriangleAlert, className: "border-amber-500/30", iconClass: "text-amber-500" },
  danger: { icon: CircleAlert, className: "border-destructive/30", iconClass: "text-destructive" },
};

export function Aside({
  type = "note",
  title,
  children,
}: {
  type?: string;
  title?: string;
  children?: ReactNode;
}) {
  const variant = ASIDE_VARIANTS[type] ?? ASIDE_VARIANTS["note"];
  const Icon = variant.icon;
  return (
    <aside className={cn("my-5 rounded-xl border bg-card/60 px-4 py-3.5", variant.className)}>
      {title ? (
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Icon className={cn("size-4 shrink-0", variant.iconClass)} aria-hidden="true" />
          {title}
        </p>
      ) : null}
      <div className={cn("text-sm text-muted-foreground", title && "mt-2")}>{children}</div>
    </aside>
  );
}

export function Steps({ children }: { children?: ReactNode }) {
  return <ol className="docs-steps my-5">{children}</ol>;
}

export function Step({ title, children }: { title?: string; children?: ReactNode }) {
  return (
    <li className="relative pb-8 pl-12 last:pb-0">
      <span
        aria-hidden="true"
        className="docs-step-index absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-foreground"
      />
      {title ? <h3 className="pt-1 text-base font-semibold text-foreground">{title}</h3> : null}
      <div className="mt-1.5 text-sm text-muted-foreground">{children}</div>
    </li>
  );
}

export function CardGrid({ children }: { children?: ReactNode }) {
  return <div className="my-5 grid gap-3 sm:grid-cols-2">{children}</div>;
}

export function Card({ title, icon, children }: IconProps & { title?: string; children?: ReactNode }) {
  const Icon = docIcon(icon);
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        {title}
      </p>
      <div className="mt-2 text-sm text-muted-foreground">{children}</div>
    </div>
  );
}

export function Badge({ children }: { children?: ReactNode; variant?: string }) {
  return (
    <span className="glass-chip inline-flex items-center px-2.5 py-0.5 align-middle text-xs font-medium text-foreground">
      {children}
    </span>
  );
}

export function Tabs({ children }: { children?: ReactNode }) {
  const items = Children.toArray(children).filter(
    (child): child is ReactElement<TabItemProps> => isValidElement(child),
  );
  const [active, setActive] = useState(0);
  const current = items[Math.min(active, Math.max(items.length - 1, 0))];

  return (
    <div className="my-5">
      <div role="tablist" className="flex flex-wrap gap-1.5">
        {items.map((item, index) => (
          <button
            key={index}
            type="button"
            role="tab"
            aria-selected={index === active}
            onClick={() => setActive(index)}
            className={cn(
              "glass-chip px-3.5 py-1.5 text-sm transition-colors",
              index === active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.props.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="mt-3">
        {current}
      </div>
    </div>
  );
}

interface TabItemProps {
  label: string;
  children?: ReactNode;
}

export function TabItem({ children }: TabItemProps) {
  return <>{children}</>;
}

export function Collapsible({ children }: { children?: ReactNode }) {
  return (
    <details className="docs-collapsible group/collapsible my-3 rounded-xl border border-border/70 bg-card/60">
      {children}
    </details>
  );
}

export function CollapsibleTrigger({ children }: { children?: ReactNode }) {
  return (
    <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-foreground [&::-webkit-details-marker]:hidden">
      <span>{children}</span>
      <ChevronDown
        className="size-4 shrink-0 text-muted-foreground transition-transform group-open/collapsible:rotate-180"
        aria-hidden="true"
      />
    </summary>
  );
}

export function CollapsibleContent({ children }: { children?: ReactNode }) {
  return <div className="px-4 pb-4 text-sm text-muted-foreground">{children}</div>;
}

/** Passed to compiled MDX so docs content can use these components by name. */
export const mdxComponents: Record<string, unknown> = {
  Aside,
  Steps,
  Step,
  CardGrid,
  Card,
  Badge,
  Tabs,
  TabItem,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
};
