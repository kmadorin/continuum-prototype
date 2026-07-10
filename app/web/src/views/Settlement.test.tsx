// Task 8 render tests for the settlement money-shot. Mounts <Settlement/> in a
// signed-in session (session seeded via sessionStorage, restored WITHOUT
// onboarding — same path as personas.test.tsx) and stubs the shared `reads`
// client's per-party ACS. No network, no key material beyond the standard BIP-39
// test vector.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { WalletSessionProvider, SESSION_KEYS, type Onboarder } from '../state/WalletSession';
import { reads, R, DEMO } from '../lib/useLedger';
import Settlement from './Settlement';

const TEST_MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const noopOnboarder: Onboarder = { onboard: vi.fn() };
const RECEIPT_CID = 'receipt-cid-0xABCDEF';

function signedIn(children: ReactNode) {
  return <WalletSessionProvider onboarder={noopOnboarder}>{children}</WalletSessionProvider>;
}

// A ContinuationDeal (Closed) so the "awaiting" path has a stage to show; the
// receipt is toggled per-test.
const deal = {
  contractId: 'deal-1',
  templateId: '#pkg:Continuum.Deal:ContinuationDeal',
  args: { cv: DEMO.cv, dealId: DEMO.cv, stage: 'Electing' },
};
const receipt = {
  contractId: RECEIPT_CID,
  templateId: '#pkg:Continuum.Deal:SettlementReceipt',
  args: { dealId: DEMO.cv, clearingPct: '0.96', totalUnits: '4800000.0', gp: 'gp', room: [] },
};

function stub(withReceipt: boolean) {
  vi.spyOn(reads, 'activeContracts').mockImplementation(async (_party, opts) => {
    const t = opts?.templateId ?? '';
    if (t === R.deal) return [deal] as never;
    if (t === R.receipt) return (withReceipt ? [receipt] : []) as never;
    return [] as never; // disclosure, holdings
  });
}

beforeEach(() => {
  sessionStorage.clear();
  sessionStorage.setItem(SESSION_KEYS.role, 'buyer');
  sessionStorage.setItem(SESSION_KEYS.party, 'continuum-test::abc123');
  sessionStorage.setItem(SESSION_KEYS.fingerprint, 'fp-test');
  sessionStorage.setItem(SESSION_KEYS.mnemonic, TEST_MNEMONIC);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Settlement money-shot', () => {
  it('flips to SETTLED and shows the shared receipt cid when a receipt appears', async () => {
    stub(true);
    render(signedIn(<Settlement />));
    await waitFor(() => expect(screen.getByTestId('settled')).toBeTruthy());
    expect(screen.getByText('SETTLED')).toBeTruthy();
    expect(screen.getByTestId('settled-id').textContent).toBe(RECEIPT_CID);
    // Shared facts from the receipt are surfaced.
    expect(screen.getByText(DEMO.cv)).toBeTruthy();
  });

  it('shows the compact awaiting state (deal stage) when no receipt is present', async () => {
    stub(false);
    render(signedIn(<Settlement />));
    await waitFor(() => expect(screen.getByText(/awaiting atomic settlement/i)).toBeTruthy());
    expect(screen.queryByTestId('settled')).toBeNull();
    expect(screen.getByText('Electing')).toBeTruthy();
  });
});
