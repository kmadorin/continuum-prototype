// Unit tests for the per-tab wallet session gate (Task 6).
//
// SECURITY: these tests use ONLY a throwaway BIP-39 test-vector mnemonic — never
// a real wallet seed. The session keeps key material in-memory + sessionStorage
// (per-tab, browser-local); the derived PUBLIC key alone leaves via onboard().
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import {
  WalletSessionProvider,
  useSession,
  SESSION_KEYS,
  type Onboarder,
} from './WalletSession';

// Standard BIP-39 test vector — NOT a real wallet.
const TEST_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

function fakeOnboarder(result = { partyId: 'party::abc123', fingerprint: 'fp-deadbeef' }): Onboarder {
  return { onboard: vi.fn().mockResolvedValue(result) };
}

function makeWrapper(onboarder: Onboarder) {
  return ({ children }: { children: ReactNode }) => (
    <WalletSessionProvider onboarder={onboarder}>{children}</WalletSessionProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('WalletSession', () => {
  it('starts signed-out with no session', () => {
    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper(fakeOnboarder()) });
    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.role).toBeNull();
    expect(result.current.party).toBeNull();
  });

  it('signIn derives the key, calls onboard, and stores the returned party', async () => {
    const onb = fakeOnboarder();
    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper(onb) });

    await act(async () => {
      await result.current.signIn('gp', TEST_MNEMONIC);
    });

    // The mnemonic (not the private key) is passed to onboard, which derives and
    // sends ONLY the public key to the server.
    expect(onb.onboard).toHaveBeenCalledTimes(1);
    expect(onb.onboard).toHaveBeenCalledWith(expect.any(String), TEST_MNEMONIC);

    expect(result.current.isSignedIn).toBe(true);
    expect(result.current.role).toBe('gp');
    expect(result.current.party).toBe('party::abc123');
    expect(result.current.fingerprint).toBe('fp-deadbeef');
    // Key material is derived and held in-memory for signing.
    expect(result.current.key?.priv).toBeInstanceOf(Uint8Array);
  });

  it('locks the tab to one role: a second signIn as a different role is refused', async () => {
    const onb = fakeOnboarder();
    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper(onb) });

    await act(async () => {
      await result.current.signIn('gp', TEST_MNEMONIC);
    });

    await act(async () => {
      await expect(result.current.signIn('buyer', TEST_MNEMONIC)).rejects.toThrow(/signed in|locked/i);
    });

    // Still locked to the original role; onboard was not called a second time.
    expect(result.current.role).toBe('gp');
    expect(onb.onboard).toHaveBeenCalledTimes(1);
  });

  it('signOut clears the session and all key material from sessionStorage', async () => {
    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper(fakeOnboarder()) });

    await act(async () => {
      await result.current.signIn('gp', TEST_MNEMONIC);
    });
    expect(sessionStorage.getItem(SESSION_KEYS.mnemonic)).toBe(TEST_MNEMONIC);

    act(() => {
      result.current.signOut();
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.role).toBeNull();
    expect(result.current.key).toBeNull();
    // No key material lingers after sign-out.
    expect(sessionStorage.getItem(SESSION_KEYS.mnemonic)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.role)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.party)).toBeNull();
  });

  it('restores the session from sessionStorage on reload (fresh provider, no re-onboard)', async () => {
    const onb1 = fakeOnboarder();
    const { result, unmount } = renderHook(() => useSession(), { wrapper: makeWrapper(onb1) });

    await act(async () => {
      await result.current.signIn('lpExiting', TEST_MNEMONIC);
    });
    unmount();

    // Simulate a page reload in the SAME tab: a brand-new provider over the same
    // (persisted) sessionStorage, with a fresh onboarder that must NOT be called.
    const onb2 = fakeOnboarder();
    const { result: restored } = renderHook(() => useSession(), { wrapper: makeWrapper(onb2) });

    expect(restored.current.isSignedIn).toBe(true);
    expect(restored.current.role).toBe('lpExiting');
    expect(restored.current.party).toBe('party::abc123');
    expect(restored.current.fingerprint).toBe('fp-deadbeef');
    // The key is re-derived from the stored mnemonic without touching the network.
    expect(restored.current.key?.priv).toBeInstanceOf(Uint8Array);
    expect(onb2.onboard).not.toHaveBeenCalled();
  });

  it('surfaces onboard failures and does not persist a half-open session', async () => {
    const failing: Onboarder = { onboard: vi.fn().mockRejectedValue(new Error('allocate boom')) };
    const { result } = renderHook(() => useSession(), { wrapper: makeWrapper(failing) });

    await act(async () => {
      await expect(result.current.signIn('gp', TEST_MNEMONIC)).rejects.toThrow('allocate boom');
    });

    expect(result.current.isSignedIn).toBe(false);
    expect(result.current.role).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.role)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEYS.mnemonic)).toBeNull();
  });
});
