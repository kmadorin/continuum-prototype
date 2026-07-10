// Per-tab wallet session gate (Task 6).
//
// Each role signs into ONE browser tab and that tab is locked to that role's
// Canton external party for the whole session. The demo opens SEPARATE tabs, one
// per role — and because `sessionStorage` is per-tab, "separate tabs = separate
// role sessions" comes for free. This is NOT an in-tab "Viewing as" switcher; it
// is a login gate + per-tab role lock.
//
// SECURITY (hard rule): the mnemonic/private key is wallet key material. It lives
// ONLY in-memory + `sessionStorage` (per-tab, browser-local, cleared when the tab
// closes). It is NEVER sent to any server (only the derived PUBLIC key leaves, and
// only inside `onboard`), NEVER logged, and NEVER written to a repo file.
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { keyFromMnemonic, type Ed25519Key } from '../../../ledger-client/src/ed25519';
import type { OnboardResult } from '../../../ledger-client/src/wallet';

/** The five demo seats. Each browser tab locks to exactly one of these. */
export type Role = 'gp' | 'buyer' | 'lpExiting' | 'lpRolling' | 'lpac';

export const ROLES: Role[] = ['gp', 'buyer', 'lpExiting', 'lpRolling', 'lpac'];

/**
 * The onboarding boundary. `WalletClient` from the ledger-client satisfies this
 * (`onboard(partyHint, mnemonicOrKey)`); tests inject a fake so no network is hit.
 * Only the PUBLIC key derived inside `onboard` ever leaves the browser.
 */
export interface Onboarder {
  onboard(partyHint: string, mnemonicOrKey: string): Promise<OnboardResult>;
}

/** `sessionStorage` keys (per-tab, browser-local). Namespaced to avoid clashes. */
export const SESSION_KEYS = {
  role: 'continuum.session.role',
  party: 'continuum.session.party',
  fingerprint: 'continuum.session.fingerprint',
  // Key material — sessionStorage ONLY (per-tab), never sent/logged/committed.
  mnemonic: 'continuum.session.mnemonic',
} as const;

export type Session = {
  role: Role;
  party: string;
  fingerprint: string;
  key: Ed25519Key;
};

type Ctx = {
  role: Role | null;
  party: string | null;
  fingerprint: string | null;
  key: Ed25519Key | null;
  isSignedIn: boolean;
  /** Sign this tab in as `role`, onboarding the wallet derived from `mnemonic`. */
  signIn: (role: Role, mnemonic: string) => Promise<void>;
  /** Clear the session and all key material from this tab. */
  signOut: () => void;
};

const C = createContext<Ctx | null>(null);

/** A partyHint that ties the allocated party to its role (kept human-readable). */
function partyHint(role: Role): string {
  return `continuum-${role}`;
}

/** Restore a session from this tab's sessionStorage, if one is present + intact. */
function restore(): Session | null {
  try {
    const role = sessionStorage.getItem(SESSION_KEYS.role) as Role | null;
    const party = sessionStorage.getItem(SESSION_KEYS.party);
    const fingerprint = sessionStorage.getItem(SESSION_KEYS.fingerprint);
    const mnemonic = sessionStorage.getItem(SESSION_KEYS.mnemonic);
    if (!role || !party || !fingerprint || !mnemonic) return null;
    // Re-derive the key from the stored mnemonic — no network, no re-onboard.
    return { role, party, fingerprint, key: keyFromMnemonic(mnemonic) };
  } catch {
    return null;
  }
}

export function WalletSessionProvider({
  onboarder,
  children,
}: {
  onboarder: Onboarder;
  children: ReactNode;
}) {
  // Lazy init reads sessionStorage once so a reload in the SAME tab restores the
  // signed-in role without re-onboarding.
  const [session, setSession] = useState<Session | null>(() => restore());

  const value = useMemo<Ctx>(() => {
    return {
      role: session?.role ?? null,
      party: session?.party ?? null,
      fingerprint: session?.fingerprint ?? null,
      key: session?.key ?? null,
      isSignedIn: session != null,
      async signIn(role, mnemonic) {
        // Per-tab lock: once signed in, this tab is bound to its role. A different
        // role must signOut first. (Re-signing the same role is allowed.)
        if (session && session.role !== role) {
          throw new Error(
            `This tab is already signed in as "${session.role}" — sign out before switching role.`,
          );
        }
        // Derive key material locally (may throw on a bad mnemonic — surfaced).
        const key = keyFromMnemonic(mnemonic);
        // Onboard the external party. Only the PUBLIC key leaves the browser here.
        // Failures propagate to the UI; nothing is persisted on failure.
        const { partyId, fingerprint } = await onboarder.onboard(partyHint(role), mnemonic);

        // Commit atomically only after a successful onboard.
        try {
          sessionStorage.setItem(SESSION_KEYS.role, role);
          sessionStorage.setItem(SESSION_KEYS.party, partyId);
          sessionStorage.setItem(SESSION_KEYS.fingerprint, fingerprint);
          sessionStorage.setItem(SESSION_KEYS.mnemonic, mnemonic);
        } catch {
          // sessionStorage unavailable (private mode / quota): keep the in-memory
          // session so the tab still works; it just won't survive a reload.
        }
        setSession({ role, party: partyId, fingerprint, key });
      },
      signOut() {
        try {
          for (const k of Object.values(SESSION_KEYS)) sessionStorage.removeItem(k);
        } catch {
          /* nothing to clear */
        }
        setSession(null);
      },
    };
  }, [session, onboarder]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(C);
  if (!c) throw new Error('useSession must be used within a WalletSessionProvider');
  return c;
}
