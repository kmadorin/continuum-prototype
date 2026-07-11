// Valuation tab tests: the independent valuer identity + the report's sha256 render,
// and the "Verify on-ledger" button calls /verify and flips to the green match state.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { installBackend } from '../test/mockBackend';
import ValuationTab from './ValuationTab';

const HASH = 'ab5a539d8b780626370a095f2eb5f1c245abe242a772462e644706b73607de09';

const MANIFEST = [
  {
    name: 'valuation-report',
    file: 'valuation-report.html',
    title: 'Independent Valuation — Project Continuum CV I, L.P.',
    group: 'Deal Formation',
    signer: 'Kroll Valuation Services',
    date: '2026-06-30',
    sha256: HASH,
    templateSuffix: 'Continuum.Valuation:ValuationReport',
    contentType: 'text/html; charset=utf-8',
  },
];

const report: ActiveContract = {
  contractId: 'v1',
  templateId: 't',
  args: {
    agent: 'continuum-valuer-demo::abc123',
    gp: 'continuum-gp-demo::abc123',
    dealId: 'M1',
    navLow: '480000000.0',
    navHigh: '520000000.0',
    asOfDate: '2026-06-30',
    contentHash: HASH,
  },
};

describe('ValuationTab', () => {
  beforeEach(() => {
    installBackend({
      me: { role: 'gp', party: 'continuum-gp-demo::abc123', custodianName: 'Fireblocks — GP Treasury' },
      docsManifest: MANIFEST,
      verify: {
        'valuation-report': {
          docSha256: HASH,
          onChainHash: HASH,
          matches: true,
          contractId: 'cid-abcdef123456',
          note: `Hash matches on-chain anchor · contract cid-abcdef123456`,
        },
      },
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the independent valuer, the NAV range, and the report sha256', async () => {
    render(<ValuationTab report={report} />);
    expect(screen.getByText('Independent Valuation Agent')).toBeTruthy();
    // Valuer name resolves from the manifest signer.
    expect(await screen.findByText('Kroll Valuation Services')).toBeTruthy();
    // NAV range bar renders the figures.
    expect(screen.getByTestId('nrb-nav')).toBeTruthy();
    // Truncated sha256 chip.
    expect(screen.getByText(`${HASH.slice(0, 10)}…${HASH.slice(-6)}`)).toBeTruthy();
    // View + Verify affordances.
    expect(screen.getByRole('link', { name: /View report/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Verify on-ledger/i })).toBeTruthy();
  });

  it('verifies on-ledger and shows the green hash-match state', async () => {
    render(<ValuationTab report={report} />);
    fireEvent.click(screen.getByRole('button', { name: /Verify on-ledger/i }));
    await waitFor(() =>
      expect(screen.getByTestId('verify-badge').textContent).toMatch(/Hash matches on-chain anchor/i),
    );
    expect(screen.getByTestId('verify-badge').className).toContain('ok');
  });
});
