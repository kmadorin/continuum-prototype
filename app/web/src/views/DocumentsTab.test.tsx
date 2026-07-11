// Documents accordion tests: the three groups render from the mocked manifest, a
// row's Verify hits /verify and shows the match badge, and a not-yet-anchored doc
// greys out with the pending note.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
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

  it('verifies an anchored row → match badge', async () => {
    render(<DocumentsTab />);
    const row = (await screen.findByText('Valuation Report')).closest('.doc-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^Verify$/i }));
    await waitFor(() =>
      expect(within(row).getByTestId('verify-badge').textContent).toMatch(/Hash matches on-chain anchor/i),
    );
  });

  it('greys a not-yet-anchored row with a pending note', async () => {
    render(<DocumentsTab />);
    const row = (await screen.findByText('Fairness Opinion')).closest('.doc-row') as HTMLElement;
    fireEvent.click(within(row).getByRole('button', { name: /^Verify$/i }));
    await waitFor(() => expect(row.className).toContain('greyed'));
    expect(within(row).getByText(/Pending — produced at Deal Formation/)).toBeTruthy();
  });
});
