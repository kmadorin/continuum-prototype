// Render tests for the settlement money-shot (custody build). Mounts <Settlement/>
// in a signed-in backend session (restored via a mocked /me) and stubs the shared
// `reads` client's per-party ACS. No network, no key material.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider } from '../state/WalletSession';
import { reads, R, DEMO } from '../lib/useLedger';
import { installBackend } from '../test/mockBackend';
import Settlement from './Settlement';

const ME_PARTY = 'continuum-buyer-demo::abc123';
const RECEIPT_CID = 'receipt-cid-0xABCDEF';

function signedIn(children: ReactNode) {
  return <SessionProvider>{children}</SessionProvider>;
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
  installBackend({
    me: { role: 'buyer', party: ME_PARTY, custodianName: 'Copper — buyer' },
    registry: { parties: { buyer: ME_PARTY }, custodians: {} },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

  it('renders nothing until the close is settled (deal state lives in the Stepper)', async () => {
    stub(false);
    const { container } = render(signedIn(<Settlement />));
    // Give the poll a tick; with no receipt the overlay must not appear.
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId('settled')).toBeNull();
    expect(container.querySelector('.awaiting-strip')).toBeNull();
  });
});
