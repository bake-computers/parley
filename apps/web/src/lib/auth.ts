import { createAuthClient } from "better-auth/react";
import { apiUrl } from "./api";

export const authClient = createAuthClient({
  baseURL: apiUrl("/api/auth"),
});

export type AuthSession = Awaited<ReturnType<typeof authClient.getSession>>["data"];
