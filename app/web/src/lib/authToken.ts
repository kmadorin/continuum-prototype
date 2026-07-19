// Per-tab session token in sessionStorage, so each tab carries its own seat (a cookie
// would be shared across all tabs of the origin). The token is the backend's
// HMAC-signed identity — non-secret, no key material — but it IS a bearer credential
// readable by page JS: a deliberate per-tab tradeoff for the devnet demo.

const TOKEN_KEY = 'continuum-session-token';

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage disabled — session simply won't survive a reload */
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* nothing to clear */
  }
}

export function authHeaders(base?: HeadersInit): HeadersInit {
  const token = getToken();
  const merged: Record<string, string> = { ...(base as Record<string, string>) };
  if (token) merged.Authorization = `Bearer ${token}`;
  return merged;
}

/** fetch() with this tab's Bearer token attached. Use for authed endpoints. */
export function authFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, { ...init, headers: authHeaders(init.headers) });
}
