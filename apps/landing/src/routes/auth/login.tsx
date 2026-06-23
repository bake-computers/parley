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
  const me = useAuthMe();

  if (me === undefined) {
    return (
      <main className="flex min-h-[50vh] items-center justify-center px-6">
        <p className="text-muted-foreground text-sm">Loading session…</p>
      </main>
    );
  }

  if (me) {
    return <Navigate to={redirectTo} replace />;
  }

  return <AuthLoginPage redirectTo={redirectTo} />;
}