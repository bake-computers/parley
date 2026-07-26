export const CONSENT_STORAGE_KEY = "parley_cookie_consent";
export const CONSENT_VERSION = "v1";
export const THEME_STORAGE_KEY = "parley-theme";

export type CookieConsent = {
  version: string;
  essential: true;
  preferences: boolean;
  at: number;
};

export function readConsent(): CookieConsent | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<CookieConsent>;
    if (
      parsed.version !== CONSENT_VERSION ||
      parsed.essential !== true ||
      typeof parsed.preferences !== "boolean" ||
      typeof parsed.at !== "number"
    ) {
      return null;
    }
    return {
      version: CONSENT_VERSION,
      essential: true,
      preferences: parsed.preferences,
      at: parsed.at,
    };
  } catch {
    return null;
  }
}

export function writeConsent(preferences: boolean): CookieConsent {
  const consent: CookieConsent = {
    version: CONSENT_VERSION,
    essential: true,
    preferences,
    at: Date.now(),
  };
  localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(consent));
  if (!preferences) {
    localStorage.removeItem(THEME_STORAGE_KEY);
  }
  return consent;
}

export function hasConsent(): boolean {
  return readConsent() !== null;
}

export function allowsPreferences(): boolean {
  return readConsent()?.preferences === true;
}
