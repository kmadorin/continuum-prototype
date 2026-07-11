// LPAC tests: the governance seat is a REVIEW QUEUE (two deal-formation documents
// side by side) with the fairness-sign action while consent is pending, and flips to
// read-only "oversight mode" once consent is recorded (deal advanced past Setup).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { SessionProvider } from '../state/WalletSession';
import { ToastProvider } from '../state/Toast';
import { reads } from '../lib/useLedger';
import { installBackend } from '../test/mockBackend';
import LPAC from './LPAC';

const ME = 'continuum-lpac-demo::abc123';
const deal = (stage: string): ActiveContract => ({
  contractId: 'd1',
  templateId: 't',
  args: { cv: 'Meridian CV I', dealId: 'M1', stage, refNav: '500000000.0' },
});

function mounted(node: ReactNode) {
  return render(
    <ToastProvider>
      <SessionProvider>{node}</SessionProvider>
    </ToastProvider>,
  );
}

// Route reads by template suffix: the deal read returns our fixture, all else empty.
function mockReads(dealStage: string | null) {
  vi.spyOn(reads, 'activeContracts').mockImplementation(async (_party, opts) => {
    const t = (opts as { templateId?: string })?.templateId ?? '';
    if (t.includes('Deal:ContinuationDeal') && dealStage) return [deal(dealStage)];
    return [];
  });
}

describe('LPAC review queue + oversight mode', () => {
  beforeEach(() => {
    installBackend({
      me: { role: 'lpac', party: ME, custodianName: 'State Street — LPAC' },
      registry: { parties: { gp: 'gp::ns', lpac: ME }, custodians: { lpac: 'State Street — LPAC' } },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the two-document review queue + sign-fairness action while consent is pending (Setup)', async () => {
    mockReads('Setup');
    mounted(<LPAC embedded={['governance']} />);
    // Two reviewable documents (valuation + fairness) side by side.
    await waitFor(() => expect(screen.getAllByTestId('review-doc')).toHaveLength(2));
    expect(screen.getByRole('button', { name: /Sign fairness opinion/i })).toBeTruthy();
    // Not yet in oversight mode.
    expect(screen.queryByTestId('oversight-mode')).toBeNull();
  });

  it('flips to read-only oversight mode once consent is recorded (past Setup)', async () => {
    mockReads('Consented');
    mounted(<LPAC embedded={['governance']} />);
    await waitFor(() => expect(screen.getByTestId('oversight-mode')).toBeTruthy());
    expect(screen.getByText(/Oversight mode — consent recorded/i)).toBeTruthy();
    // No more action CTAs — reads only.
    expect(screen.queryByRole('button', { name: /Sign fairness opinion/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Grant conflict waiver/i })).toBeNull();
  });
});
