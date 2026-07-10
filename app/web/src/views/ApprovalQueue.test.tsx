// Render test for the four-eyes approval queue (custody build). Mounts <ApprovalQueue/>
// in a signed-in buyer session and stubs the shared `reads` client so its own ACS
// projection returns an ExecDelegationProposal addressed to it — the queue should
// surface a reviewable "Approve & Sign" card. No network, no key material.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { SessionProvider } from '../state/WalletSession';
import { reads, R } from '../lib/useLedger';
import { installBackend } from '../test/mockBackend';
import ApprovalQueue from './ApprovalQueue';

const ME_PARTY = 'continuum-buyer-demo::abc123';

const proposal = {
  contractId: 'edp-buyer-1',
  templateId: '#pkg:Continuum.Registry:ExecDelegationProposal',
  args: { admin: 'gp::ns', party: ME_PARTY },
};

function signedIn(children: ReactNode) {
  return <SessionProvider>{children}</SessionProvider>;
}

beforeEach(() => {
  installBackend({
    me: { role: 'buyer', party: ME_PARTY, custodianName: 'Copper — buyer custodian' },
    registry: { parties: { buyer: ME_PARTY }, custodians: { buyer: 'Copper — buyer custodian' } },
  });
  vi.spyOn(reads, 'activeContracts').mockImplementation(async (_party, opts) => {
    if (opts?.templateId === R.execDelegProp) return [proposal] as never;
    return [] as never; // deal + everything else empty
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ApprovalQueue — four-eyes release', () => {
  it('renders an Approve & Sign card for a pending ExecDelegationProposal', async () => {
    render(signedIn(<ApprovalQueue />));
    await waitFor(() => expect(screen.getByTestId('approval-card')).toBeTruthy());
    expect(screen.getByText(/Approve & Sign delegation/i)).toBeTruthy();
    // Four-eyes framing: the reviewing custodian officer is named.
    expect(screen.getByText(/Copper — buyer custodian/i)).toBeTruthy();
    // A Reject affordance exists (local dismiss for the demo).
    expect(screen.getByText(/^Reject$/i)).toBeTruthy();
  });

  it('shows the empty state when nothing is awaiting this party', async () => {
    vi.spyOn(reads, 'activeContracts').mockResolvedValue([] as never);
    render(signedIn(<ApprovalQueue />));
    await waitFor(() => expect(screen.getByText(/Nothing awaiting your signature/i)).toBeTruthy());
    expect(screen.queryByTestId('approval-card')).toBeNull();
  });
});
