import { useEffect, useState } from "react";

export type AuthMeUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export type AuthMeResponse = {
  user: AuthMeUser;
  guilds: Array<{ id: string; name: string; icon: string | null; owner: boolean }>;
  expiresAtMs: number;
};

export function useAuthMe(): AuthMeResponse | null | undefined {
  const [me, setMe] = useState<AuthMeResponse | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { credentials: "include" })
      .then(async (res) => (res.ok ? ((await res.json()) as AuthMeResponse) : null))
      .then((data) => {
        if (!cancelled) {
          setMe(data?.user ? data : null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMe(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return me;
}