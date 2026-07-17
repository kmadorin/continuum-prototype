// FocusedPage tests: narrow seats get a role-scoped shell, NOT the full 6-tab Deal
// Page. Valuer is the extreme case (one sign card, no stepper, no KPI strip); buyer
// gets a mini-stepper + a single Clearing-price tile + its bid card. All ledger
// reads are stubbed empty (pristine "waiting" state); custody session via mocked /me.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { SessionProvider } from '../state/WalletSession';
import { InspectorProvider } from '../state/Inspector';
import { ToastProvider } from '../state/Toast';
import { reads } from '../lib/useLedger';
import { installBackend } from '../test/mockBackend';
import FocusedPage from './FocusedPage';
import type { Role } from '../state/WalletSession';

const ME = 'me::ns';

function mount(role: Role) {
  installBackend({
    me: { role, party: ME, custodianName: 'Test Custodian' },
    registry: {
      parties: { gp: 'gp::ns', buyer: ME, lpExiting: ME, lpRolling: ME, lpac: ME, valuer: ME },
      custodians: { gp: 'Fireblocks — GP treasury' },
    },
  });
  vi.spyOn(reads, 'activeContracts').mockResolvedValue([]);
  return render(
    <InspectorProvider>
      <ToastProvider>
        <SessionProvider>
          <FocusedPage />
        </SessionProvider>
      </ToastProvider>
    </InspectorProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FocusedPage — role-scoped shells', () => {
  beforeEach(() => vi.clearAllMocks());

  it('valuer: one sign-and-anchor screen — no KPI strip, no mini-stepper', async () => {
    mount('valuer');
    expect(await screen.findByText(/Independent Valuation Agent/)).toBeTruthy();
    expect(screen.getByText(/Sign & anchor the independent valuation/)).toBeTruthy();
    // No lifecycle-wide chrome for the valuer projection (single contract).
    expect(screen.queryByTestId('kpi-row')).toBeNull();
    expect(screen.queryByTestId('lifecycle-stepper')).toBeNull();
    // Never the full Deal Page tab nav.
    expect(screen.queryByRole('tab', { name: /Overview/ })).toBeNull();
  });

  it('buyer: mini-stepper + a single Clearing-price tile + the bid card, no full tabs', async () => {
    mount('buyer');
    expect(await screen.findByText('Sealed bid')).toBeTruthy();
    // Projection-safe KPI strip: exactly the Clearing price tile (pending pre-auction).
    await waitFor(() => expect(screen.getByTestId('kpi-row')).toBeTruthy());
    await waitFor(() => expect(screen.getByText('Clearing price')).toBeTruthy(), { timeout: 2500 });
    // A 3-cue mini-stepper (not the full 6-stage lifecycle). The Shell mounts it in
    // two chrome slots — desktop page-head and the mobile header row — CSS shows one.
    expect(screen.getAllByTestId('lifecycle-stepper').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Bid open').length).toBeGreaterThan(0);
    // No Overview / Settlement full-page tabs.
    expect(screen.queryByRole('tab', { name: /Overview/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Settlement/ })).toBeNull();
  });

  it('lpac: governance seat keeps a slim Documents/Ledger tab pair (not the full 6)', async () => {
    mount('lpac');
    // Governance review queue renders (its heading).
    expect(await screen.findByText(/Review queue — deal formation/)).toBeTruthy();
    // Slim oversight tab strip: Documents + Ledger only.
    await waitFor(() => expect(screen.getByRole('tab', { name: /Documents/ })).toBeTruthy());
    expect(screen.getByRole('tab', { name: /Ledger/ })).toBeTruthy();
    // But NOT the GP-only lifecycle tabs.
    expect(screen.queryByRole('tab', { name: /Overview/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Auction/ })).toBeNull();
  });
});
