import { cn } from "#/lib/shared/cn";

export function PageSections({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("relative", className)}>{children}</div>;
}

export function PageSection({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-28 px-4 py-16 md:px-6 md:py-24", className)}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}
