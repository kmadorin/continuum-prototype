// Light smoke tests for the five persona views (custody build): each mounts in a
// signed-in backend session and renders its own header + primary action, with all
// ledger reads stubbed (no network). The session is restored via a mocked /me —
// there is NO key material, NO mnemonic, NO sessionStorage.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider } from '../state/WalletSession';
import { reads } from '../lib/useLedger';
import { installBackend } from '../test/mockBackend';
import Advisor from './Advisor';
import Buyer from './Buyer';
import ExitingLP from './ExitingLP';
import RollingLP from './RollingLP';
import LPAC from './LPAC';

const ME_PARTY = 'continuum-gp-demo::abc123';
const REGISTRY = {
  parties: { gp: ME_PARTY, buyer: 'buyer::ns', lpExiting: 'lpx::ns', lpRolling: 'lpr::ns', lpac: 'lpac::ns' },
  custodians: { gp: 'Fireblocks — GP treasury' },
};

function signedIn(children: ReactNode) {
  return <SessionProvider>{children}</SessionProvider>;
}

beforeEach(() => {
  installBackend({
    me: { role: 'gp', party: ME_PARTY, custodianName: 'Fireblocks — GP treasury' },
    registry: REGISTRY,
  });
  // All ACS reads resolve empty — the views render their pristine "waiting" state.
  vi.spyOn(reads, 'activeContracts').mockResolvedValue([]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('persona views render in a signed-in backend session', () => {
  const cases: [string, ReactNode, RegExp][] = [
    ['Advisor', <Advisor />, /Run the closing room/i],
    ['Buyer', <Buyer />, /Bid sealed, buy the units/i],
    ['ExitingLP', <ExitingLP />, /Cash out at the set price/i],
    ['RollingLP', <RollingLP />, /Roll into the new vehicle/i],
    ['LPAC', <LPAC />, /Verify it was fair/i],
  ];

  it.each(cases)('%s shows its header and reads its own ACS', async (_name, node, heading) => {
    render(signedIn(node));
    expect(await screen.findByText(heading)).toBeTruthy();
    // The view drives at least one activeContracts read against its own party.
    await waitFor(() => expect(reads.activeContracts).toHaveBeenCalled());
    expect(reads.activeContracts).toHaveBeenCalledWith(ME_PARTY, expect.anything());
  });
});
