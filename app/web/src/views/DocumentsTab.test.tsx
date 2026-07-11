// Documents accordion tests: the three groups render from the mocked manifest, each
// row auto-checks its anchor, an anchored row shows signer + hash + the green match
// badge (SIGNED & ANCHORED), and a not-yet-anchored row shows AWAITING with NO
// signer, NO hash, NO Verify button (never "signed but not anchored").
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { installBackend } from '../test/mockBackend';
import DocumentsTab from './DocumentsTab';

const entry = (over: Record<string, unknown>) => ({
  file: 'x.html',
  sha256: 'ab5a539d8b780626370a095f2eb5f1c245abe242a772462e644706b73607de09',
  templateSuffix: 'X',
  contentType: 'text/html; charset=utf-8',
  ...over,
});

const MANIFEST = [
  entry({ name: 'valuation-report', title: 'Valuation Report', group: 'Deal Formation', signer: 'Kroll', date: '2026-06-30' }),
  entry({ name: 'fairness-opinion', title: 'Fairness Opinion', group: 'Deal Formation', signer: 'State Street', date: '2026-06-30' }),
  entry({ name: 'purchase-agreement', title: 'Purchase & Sale Agreement', group: 'Settlement', signer: 'Fireblocks', date: '2026-06-30' }),
];

describe('DocumentsTab', () => {
  beforeEach(() => {
    installBackend({
      me: { role: 'gp', party: 'continuum-gp-demo::abc123', custodianName: 'Fireblocks — GP Treasury' },
      docsManifest: MANIFEST,
      verify: {
        'valuation-report': { docSha256: 'a', onChainHash: 'a', matches: true, contractId: 'cid-123456789', note: 'ok' },
        'fairness-opinion': { docSha256: 'a', onChainHash: null, matches: false, note: 'not yet anchored' },
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the three groups with their documents', async () => {
    render(<DocumentsTab />);
    expect(await screen.findByRole('heading', { name: 'Deal Formation' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Process Certifications' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Settlement' })).toBeTruthy();
    expect(screen.getByText('Valuation Report')).toBeTruthy();
    expect(screen.getByText('Fairness Opinion')).toBeTruthy();
    expect(screen.getByText('Purchase & Sale Agreement')).toBeTruthy();
    expect(screen.getAllByTestId('doc-row')).toHaveLength(3);
  });

  it('SIGNED & ANCHORED: an anchored row auto-shows signer, hash, and the green match badge', async () => {
    render(<DocumentsTab />);
    const row = (await screen.findByText('Valuation Report')).closest('.doc-row') as HTMLElement;
    // Auto-verify resolves to the match badge without any click.
    await waitFor(() =>
      expect(within(row).getByTestId('verify-badge').textContent).toMatch(/Hash matches on-chain anchor/i),
    );
    // Signer, a copyable hash chip, and a Re-verify affordance are present.
    expect(within(row).getByText(/Signed by Kroll/)).toBeTruthy();
    expect(within(row).getByRole('button', { name: /Copy sha256/i })).toBeTruthy();
    expect(within(row).getByRole('button', { name: /Re-verify/i })).toBeTruthy();
    expect(row.getAttribute('data-state')).toBe('signed');
  });

  it('AWAITING: a not-yet-anchored row greys out with NO signer, NO hash, NO Verify button', async () => {
    render(<DocumentsTab />);
    const row = (await screen.findByText('Fairness Opinion')).closest('.doc-row') as HTMLElement;
    await waitFor(() => expect(row.getAttribute('data-state')).toBe('awaiting'));
    expect(row.className).toContain('greyed');
    expect(within(row).getByText(/Awaiting — produced at Deal Formation/)).toBeTruthy();
    // Never "signed but not anchored": no signer, no hash chip, no Verify button.
    expect(within(row).queryByText(/State Street/)).toBeNull();
    expect(within(row).queryByRole('button', { name: /Copy sha256/i })).toBeNull();
    expect(within(row).queryByRole('button', { name: /Verify/i })).toBeNull();
    // A muted Draft link may remain (off-chain prepared bytes).
    expect(within(row).getByRole('link', { name: /^Draft$/i })).toBeTruthy();
  });
});
