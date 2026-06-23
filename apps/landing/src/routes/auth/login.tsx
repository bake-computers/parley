import { createFileRoute, Navigate } from "@tanstack/react-router";
import { AuthLoginPage } from "#/components/auth/AuthLoginPage";
import { useAuthMe } from "#/hooks/useAuthMe";

type LoginSearch = {
  redirect?: string;
};

function safeRedirect(value: string | undefined): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

export const Route = createFileRoute("/auth/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  component: LoginRoute,
});

function LoginRoute() {
  const { redirect } = Route.useSearch();
  const redirectTo = safeRedirect(redirect);
  const { me, error } = useAuthMe();

  if (me === undefined && !error) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center px-6">
        <div role="status" className="flex flex-col items-center gap-4">
          <div
            className="dashboard-spinner size-9 rounded-full border-2 border-muted/60 border-t-primary"
            aria-hidden
          />
          <p className="text-muted-foreground text-sm">Loading session…</p>
        </div>
      </main>
    );
  }

  if (me) {
    return <Navigate to={redirectTo} replace />;
  }

  return <AuthLoginPage redirectTo={redirectTo} />;
}