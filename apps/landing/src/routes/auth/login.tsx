import { createFileRoute } from "@tanstack/react-router";
import { AuthLoginPage } from "#/components/auth/AuthLoginPage";

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
  return <AuthLoginPage redirectTo={safeRedirect(redirect)} />;
}