import { useCallback, useEffect, useState } from "react";

export type AuthMeUser = {
  id: string;
  username: string;
  globalName: string | null;
  avatar: string | null;
};

export type AuthMeGuild = {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  canManage: boolean;
  parleyInstalled: boolean;
  inviteUrl: string | null;
};

export type AuthMeResponse = {
  user: AuthMeUser;
  guilds: AuthMeGuild[];
  expiresAtMs: number;
};

export type AuthMeState = {
  me: AuthMeResponse | null | undefined;
  error: boolean;
  retry: () => void;
};

const CACHE_TTL_MS = 60_000;

type AuthMeCache = {
  data: AuthMeResponse | null;
  fetchedAt: number;
};

let authCache: AuthMeCache | null = null;
let inflight: Promise<AuthMeResponse | null> | null = null;

export function clearAuthMeCache(): void {
  authCache = null;
  inflight = null;
}

function cacheIsFresh(): boolean {
  return authCache !== null && Date.now() - authCache.fetchedAt < CACHE_TTL_MS;
}

async function loadAuthMe(): Promise<AuthMeResponse | null> {
  const res = await fetch("/api/auth/me", { credentials: "include" });
  if (res.status === 401) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`auth/me ${res.status}`);
  }
  const data = (await res.json()) as AuthMeResponse;
  return data?.user ? data : null;
}

async function fetchAuthMe(force = false): Promise<AuthMeResponse | null> {
  if (!force && cacheIsFresh()) {
    return authCache!.data;
  }
  if (inflight) {
    return inflight;
  }
  inflight = loadAuthMe()
    .then((data) => {
      authCache = { data, fetchedAt: Date.now() };
      return data;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useAuthMe(): AuthMeState {
  const [me, setMe] = useState<AuthMeResponse | null | undefined>(
    () => authCache?.data ?? undefined,
  );
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    clearAuthMeCache();
    setError(false);
    setMe(undefined);
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const force = attempt > 0;

    if (!force && cacheIsFresh()) {
      setMe(authCache!.data);
      setError(false);
      return;
    }

    fetchAuthMe(force)
      .then((data) => {
        if (!cancelled) {
          setMe(data);
          setError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          if (authCache?.data) {
            setMe(authCache.data);
            setError(true);
          } else {
            setError(true);
          }
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { me, error, retry };
}