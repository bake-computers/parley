import { createContext, useContext } from "react";
import type { AuthMeState } from "#/hooks/useAuthMe";

const AuthMeContext = createContext<AuthMeState | null>(null);

export function AuthMeProvider({
  value,
  children,
}: {
  value: AuthMeState;
  children: React.ReactNode;
}) {
  return <AuthMeContext.Provider value={value}>{children}</AuthMeContext.Provider>;
}

export function useAuthMeContext(): AuthMeState {
  const ctx = useContext(AuthMeContext);
  if (!ctx) {
    throw new Error("useAuthMeContext must be used within AuthMeProvider");
  }
  return ctx;
}