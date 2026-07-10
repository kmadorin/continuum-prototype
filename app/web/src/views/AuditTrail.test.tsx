// Render test for the custody audit trail (custody build). Mounts <AuditTrail/> and
// stubs the backend's /audit with the session tenant's signature entries — the tab
// should render a row per entry with the custodian, key fingerprint, action, outcome
// and a clickable update id. Also covers the empty state. No network, no key material.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { installBackend } from '../test/mockBackend';
import AuditTrail from './AuditTrail';

const AUDIT = [
  {
    ts: '2026-07-11T00:01:02.000Z',
    username: 'gp',
    custodianName: 'Fireblocks — GP treasury',
    party: 'continuum-gp-demo::ns',
    keyFingerprint: '1220abcdef0011223344556677',
    updateId: 'update-close-9',
    action: 'exercise Close on Deal:ContinuationDeal',
    outcome: 'signed',
  },
];

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AuditTrail — court-grade artifacts', () => {
  beforeEach(() => {
    installBackend({
      me: { role: 'gp', party: 'continuum-gp-demo::ns', custodianName: 'Fireblocks — GP treasury' },
      registry: { parties: {}, custodians: {} },
      audit: AUDIT,
    });
  });

  it('renders a row per signature entry with a clickable update id', async () => {
    render(<AuditTrail />);
    await waitFor(() => expect(screen.getByTestId('audit-row')).toBeTruthy());
    expect(screen.getByText(/Fireblocks — GP treasury/)).toBeTruthy();
    expect(screen.getByText(/exercise Close on Deal:ContinuationDeal/)).toBeTruthy();
    expect(screen.getByText(/signed/)).toBeTruthy();
    // The update id is a button that would open the Ledger Inspector.
    const link = screen.getByRole('button', { name: /update-close-9/ });
    expect(link).toBeTruthy();
  });
});

describe('AuditTrail — empty state', () => {
  beforeEach(() => {
    installBackend({
      me: { role: 'buyer', party: 'buyer::ns', custodianName: 'Copper — buyer' },
      registry: { parties: {}, custodians: {} },
      audit: [],
    });
  });

  it('shows the empty state before any actions', async () => {
    render(<AuditTrail />);
    await waitFor(() => expect(screen.getByText(/No signatures yet/i)).toBeTruthy());
    expect(screen.queryByTestId('audit-row')).toBeNull();
  });
});
