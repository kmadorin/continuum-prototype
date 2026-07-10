// Shared custody-backend fetch mock for unit tests. Routes the same-origin calls
// the frontend makes (/me, /auth/login, /registry, /action) to canned responses —
// no live backend, no key material. Install with `installBackend(...)` in a test's
// beforeEach; it replaces `global.fetch`.
import { vi } from 'vitest';

export type BackendState = {
  /** Current session identity returned by /me (null = 401, signed out). */
  me?: { role: string; party: string; custodianName: string } | null;
  /** Registry payload for /registry. */
  registry?: { parties: Record<string, string>; custodians: Record<string, string> };
  /** Map username → login result; a missing user yields 401. */
  users?: Record<string, { role: string; party: string; custodianName: string; password: string }>;
  /** Canned /action response. */
  action?: { updateId?: string; status?: number; error?: string };
};

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function installBackend(state: BackendState) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : (input as Request).url;
    const path = url.replace(/^https?:\/\/[^/]+/, '');

    if (path === '/registry') {
      return json(state.registry ?? { parties: {}, custodians: {} });
    }
    if (path === '/me') {
      return state.me ? json(state.me) : json({ error: 'unauthenticated' }, 401);
    }
    if (path === '/auth/login') {
      const { username, password } = JSON.parse((init?.body as string) ?? '{}');
      const u = state.users?.[username];
      if (!u || u.password !== password) return json({ error: 'invalid credentials' }, 401);
      state.me = { role: u.role, party: u.party, custodianName: u.custodianName };
      return json({ role: u.role, party: u.party, custodianName: u.custodianName });
    }
    if (path === '/action') {
      const a = state.action ?? { updateId: 'update-abc123' };
      if (a.status && a.status >= 400) return json({ error: a.error ?? 'action failed' }, a.status);
      return json({ updateId: a.updateId ?? 'update-abc123' });
    }
    return json({ error: `unrouted ${path}` }, 404);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}
