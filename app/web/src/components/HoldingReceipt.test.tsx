// Holding-provenance receipt tests: renders the held amount + cost + NAV%, shows the
// provenance sha256 from the holding meta_, and a Verify button that hits /verify and
// resolves to the on-chain match badge.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { installBackend } from '../test/mockBackend';
import HoldingReceipt from './HoldingReceipt';

const META_HASH = 'ab5a539d8b780626370a095f2eb5f1c245abe242a772462e644706b73607de09';

describe('HoldingReceipt', () => {
  beforeEach(() => {
    installBackend({
      me: { role: 'buyer', party: 'continuum-buyer-demo::abc123', custodianName: 'Copper — buyer' },
      docsManifest: [
        { name: 'valuation-report', file: 'v.html', title: 'Valuation Report', group: 'Deal Formation', signer: 'Kroll', date: '2026-06-30', sha256: META_HASH, templateSuffix: 'V', contentType: 'text/html' },
      ],
      verify: {
        'valuation-report': { docSha256: META_HASH, onChainHash: META_HASH, matches: true, contractId: 'cid-987654321', note: 'ok' },
      },
      audit: [{ ts: '2026-06-30T00:00:00Z', username: 'buyer', custodianName: 'Copper', party: 'p', keyFingerprint: 'fp', updateId: 'update-mint-0xabc123', action: 'Close', outcome: 'signed' }],
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the held amount, cost, and NAV percentage', () => {
    render(<HoldingReceipt amount={4_800_000} clearingPct={0.96} metaHash={META_HASH} />);
    expect(screen.getByTestId('hr-amount').textContent).toBe('4,800,000');
    // cost = 4,800,000 × 0.96 = 4,608,000 → $4.6M
    expect(screen.getByText(/cost \$4\.6M/)).toBeTruthy();
    expect(screen.getByText(/96\.0% of independent NAV/)).toBeTruthy();
  });

  it('shows the provenance sha256 from the holding meta_', () => {
    render(<HoldingReceipt amount={4_800_000} clearingPct={0.96} metaHash={META_HASH} />);
    expect(screen.getByText('Issued under Valuation Report')).toBeTruthy();
    // The hash chip truncates the full sha256.
    expect(screen.getByText(/ab5a539d8b…07de09/)).toBeTruthy();
  });

  it('Verify calls /verify and resolves to the on-chain match badge', async () => {
    render(<HoldingReceipt amount={4_800_000} clearingPct={0.96} metaHash={META_HASH} />);
    fireEvent.click(screen.getByRole('button', { name: /^Verify$/i }));
    await waitFor(() =>
      expect(screen.getByTestId('verify-badge').textContent).toMatch(/Hash matches on-chain anchor/i),
    );
  });
});
