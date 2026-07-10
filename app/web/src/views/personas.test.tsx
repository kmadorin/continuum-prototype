// Light smoke tests for the five real-wallet persona views (Task 7): each mounts
// in a signed-in session and renders its own header + primary action, with all
// ledger reads stubbed (no network). The session is seeded via sessionStorage so
// the provider restores it WITHOUT onboarding — the same restore path exercised
// in WalletSession.test.tsx.
//
// SECURITY: uses only the standard BIP-39 test vector — never a real wallet seed.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WalletSessionProvider, SESSION_KEYS, type Onboarder } from '../state/WalletSession';
import { reads } from '../lib/useLedger';
import Advisor from './Advisor';
import Buyer from './Buyer';
import ExitingLP from './ExitingLP';
import RollingLP from './RollingLP';
import LPAC from './LPAC';

const TEST_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const noopOnboarder: Onboarder = { onboard: vi.fn() };

function signedIn(children: ReactNode) {
  return <WalletSessionProvider onboarder={noopOnboarder}>{children}</WalletSessionProvider>;
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(SESSION_KEYS.role, 'gp');
  sessionStorage.setItem(SESSION_KEYS.party, 'continuum-test::abc123');
  sessionStorage.setItem(SESSION_KEYS.fingerprint, 'fp-test');
  sessionStorage.setItem(SESSION_KEYS.mnemonic, TEST_MNEMONIC);
  // All ACS reads resolve empty — the views render their pristine "waiting" state.
  vi.spyOn(reads, 'activeContracts').mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('persona views render in a signed-in session', () => {
  const cases: [string, ReactNode, RegExp][] = [
    ['Advisor', <Advisor />, /Run the closing room/i],
    ['Buyer', <Buyer />, /Bid sealed, buy the units/i],
    ['ExitingLP', <ExitingLP />, /Cash out at the set price/i],
    ['RollingLP', <RollingLP />, /Roll into the new vehicle/i],
    ['LPAC', <LPAC />, /Verify it was fair/i],
  ];

  it.each(cases)('%s shows its header and reads its own ACS', async (_name, node, heading) => {
    render(signedIn(node));
    expect(screen.getByText(heading)).toBeTruthy();
    // The view drives at least one activeContracts read against its own party.
    await waitFor(() => expect(reads.activeContracts).toHaveBeenCalled());
    expect(reads.activeContracts).toHaveBeenCalledWith('continuum-test::abc123', expect.anything());
  });
});
