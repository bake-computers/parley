import { cn } from "#/lib/shared/cn";

type GlassPanelProps = React.ComponentProps<"div"> & {
  as?: "div" | "section" | "article";
};

export function GlassPanel({ as: Tag = "div", className, children, ...props }: GlassPanelProps) {
  return (
    <Tag className={cn("glass-panel", className)} {...props}>
      {children}
    </Tag>
  );
}