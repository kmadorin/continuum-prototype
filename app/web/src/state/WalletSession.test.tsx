// Unit tests for the custody backend-session gate. The browser holds NO key
// material now: the session is just the non-secret identity {role, party,
// custodianName} the backend returns. All backend calls (/me, /auth/login,
// /registry) are mocked — no live calls, nothing in sessionStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider, useSession } from './WalletSession';
import { installBackend, type BackendState } from '../test/mockBackend';

const REGISTRY = {
  parties: { gp: 'gp::ns', buyer: 'buyer::ns', lpExiting: 'lpx::ns', lpRolling: 'lpr::ns', lpac: 'lpac::ns' },
  custodians: { gp: 'Fireblocks — GP treasury', buyer: 'Copper — buyer', lpExiting: 'Northgate Trust', lpRolling: 'BNY', lpac: 'State Street' },
};
const USERS = {
  gp: { role: 'gp', party: 'gp::ns', custodianName: 'Fireblocks — GP treasury', password: 'gp-demo' },
};

function wrapper({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}

let state: BackendState;
beforeEach(() => {
  state = { me: null, registry: REGISTRY, users: USERS };
  installBackend(state);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Session (custody backend)', () => {
  it('starts signed-out once /me resolves 401', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.role).toBeNull();
    expect(result.current.party).toBeNull();
  });

  it('signIn posts credentials and stores the returned identity (no key material)', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await result.current.signIn('gp', 'gp-demo');
    });

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.role).toBe('gp');
    expect(result.current.party).toBe('gp::ns');
    expect(result.current.custodianName).toBe('Fireblocks — GP treasury');
    // SECURITY: nothing secret is persisted client-side.
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('surfaces a login failure and stays signed out', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    await act(async () => {
      await expect(result.current.signIn('gp', 'wrong-password')).rejects.toThrow(/invalid credentials/i);
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.role).toBeNull();
  });

  it('restores an existing session from /me on mount', async () => {
    state.me = { role: 'lpExiting', party: 'lpx::ns', custodianName: 'Northgate Trust' };
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.role).toBe('lpExiting');
    expect(result.current.party).toBe('lpx::ns');
  });

  it('signOut drops the local identity', async () => {
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    await act(async () => {
      await result.current.signIn('gp', 'gp-demo');
    });
    expect(result.current.isSignedIn).toBe(true);

    act(() => {
      result.current.signOut();
    });
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.role).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });
});
