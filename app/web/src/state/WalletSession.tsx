// Backend-session gate (custody build). Keys are GONE from the browser — the
// custody backend holds each party's Ed25519 key and signs on its behalf. This
// context tracks ONLY the non-secret session identity returned by the backend:
// { role, party, custodianName }.
//
// SECURITY (hard rule): NO key material, NO mnemonic, NO private key ever lives in
// the browser now. Nothing is written to sessionStorage/localStorage. The session
// is an httpOnly cookie set by the backend at /auth/login; the browser never reads
// it. `GET /me` restores identity on reload; `signIn` posts credentials; `signOut`
// drops local identity (the cookie is short-lived and re-`/me` would restore, which
// is fine for the demo — a logout endpoint can be added later).
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadRegistry } from '../lib/useLedger';

/** The five demo seats (also the backend usernames). */
export type Role = 'gp' | 'buyer' | 'lpExiting' | 'lpRolling' | 'lpac';

export const ROLES: Role[] = ['gp', 'buyer', 'lpExiting', 'lpRolling', 'lpac'];

/** Non-secret session identity, exactly what `/me` and `/auth/login` return. */
export type Identity = { role: Role; party: string; custodianName: string };

type Ctx = {
  role: Role | null;
  party: string | null;
  custodianName: string | null;
  isSignedIn: boolean;
  /** True once the initial `/me` restore + `/registry` load have settled. */
  ready: boolean;
  /** Log in with backend credentials → httpOnly session cookie. */
  signIn: (username: string, password: string) => Promise<void>;
  /** Drop local identity (no key material to clear — there is none). */
  signOut: () => void;
};

const C = createContext<Ctx | null>(null);

async function readJson(r: Response): Promise<any> {
  const txt = await r.text();
  return txt ? JSON.parse(txt) : {};
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [ready, setReady] = useState(false);

  // On mount: load the PUBLIC registry (party ids) and restore any live session.
  useEffect(() => {
    let alive = true;
    (async () => {
      // Registry is public and required before any view renders; a failure here is
      // non-fatal to auth (the SignIn screen still works).
      await loadRegistry().catch(() => {});
      try {
        const r = await fetch('/me', { credentials: 'include' });
        if (alive && r.ok) {
          const me = (await readJson(r)) as Identity;
          if (me?.party) setIdentity(me);
        }
      } catch {
        /* offline / no session — stay signed out */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      role: identity?.role ?? null,
      party: identity?.party ?? null,
      custodianName: identity?.custodianName ?? null,
      isSignedIn: identity != null,
      ready,
      async signIn(username, password) {
        const r = await fetch('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, password }),
        });
        const body = await readJson(r).catch(() => ({}));
        if (!r.ok) throw new Error(body?.error ?? `login failed (${r.status})`);
        setIdentity({ role: body.role, party: body.party, custodianName: body.custodianName });
      },
      signOut() {
        setIdentity(null);
      },
    }),
    [identity, ready],
  );

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error('useSession must be used within a SessionProvider');
  return c;
}
