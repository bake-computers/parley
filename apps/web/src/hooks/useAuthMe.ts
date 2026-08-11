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
  /** Busts the cached guild list and refetches /api/auth/me?refresh=1. */
  refresh: () => Promise<void>;
};

const CACHE_TTL_MS = 60_000;

/** The HttpOnly session cookie is invisible to JS; this presence cookie mirrors it. */
const SIGNED_IN_COOKIE = "parley_signed_in";

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

// True when the non-HttpOnly signed-in presence cookie is set (browser only).
export function hasSignedInHint(): boolean {
  if (typeof document === "undefined") {
    return false;
  }
  return document.cookie.split("; ").includes(`${SIGNED_IN_COOKIE}=1`);
}

function cacheIsFresh(): boolean {
  return authCache !== null && Date.now() - authCache.fetchedAt < CACHE_TTL_MS;
}

async function loadAuthMe(refresh = false): Promise<AuthMeResponse | null> {
  const res = await fetch(refresh ? "/api/auth/me?refresh=1" : "/api/auth/me", {
    credentials: "include",
  });
  if (res.status === 401) {
    // Signed out: drop the presence cookie so subsequent loads skip the
    // /api/auth/me round trip instead of re-401ing.
    if (typeof document !== "undefined") {
      document.cookie = "parley_signed_in=; Max-Age=0; Path=/; SameSite=Lax";
    }
    return null;
  }
  if (!res.ok) {
    throw new Error(`auth/me ${res.status}`);
  }
  const data = (await res.json()) as AuthMeResponse;
  return data?.user ? data : null;
}

export async function refreshAuthMe(): Promise<AuthMeResponse | null> {
  authCache = null;
  inflight = null;
  const data = await loadAuthMe(true);
  authCache = { data, fetchedAt: Date.now() };
  return data;
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
  const [me, setMe] = useState<AuthMeResponse | null | undefined>(() => {
    // Same initializer on server and client: cached session if any, else
    // undefined (SSR always starts undefined, so the client must too to
    // avoid a hydration mismatch). The effect below then sets null without
    // fetching when no presence cookie is set.
    return authCache?.data ?? undefined;
  });
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    clearAuthMeCache();
    setError(false);
    setMe(undefined);
    setAttempt((n) => n + 1);
  }, []);

  const refresh = useCallback(async () => {
    // Rethrow so callers (e.g. the dashboard refresh button) can surface failures.
    const data = await refreshAuthMe();
    setMe(data);
    setError(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const force = attempt > 0;

    if (!force && !hasSignedInHint()) {
      setMe(null);
      setError(false);
      return;
    }

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

  return { me, error, retry, refresh };
}
