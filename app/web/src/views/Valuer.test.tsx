// Valuer screen tests: the independent-valuer seat renders its single "sign &
// anchor" action and, on click, creates a ValuationReport whose contentHash is the
// REAL anchored sha256 (VALUATION_SHA256) with navLow/navHigh from DEMO — the hash
// that makes the Valuation-tab / Documents Verify tie out on-ledger.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { SessionProvider } from '../state/WalletSession';
import { reads, DEMO } from '../lib/useLedger';
import { VALUATION_SHA256 } from '../../../custody/docs/hashes';
import { ToastProvider } from '../state/Toast';
import { installBackend } from '../test/mockBackend';
import Valuer from './Valuer';

const ME = 'continuum-valuer-demo::abc123';
const GP = 'continuum-gp-demo::abc123';

function mounted() {
  return render(
    <ToastProvider>
      <SessionProvider>
        <Valuer />
      </SessionProvider>
    </ToastProvider>,
  );
}

describe('Valuer screen', () => {
  let fetchMock: ReturnType<typeof installBackend>;
  beforeEach(() => {
    fetchMock = installBackend({
      me: { role: 'valuer', party: ME, custodianName: 'Kroll Valuation Services' },
      registry: { parties: { gp: GP, valuer: ME }, custodians: { valuer: 'Kroll Valuation Services' } },
      action: { updateId: 'update-val-1' },
    });
    vi.spyOn(reads, 'activeContracts').mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the independent-valuer identity and the sign-and-anchor action', async () => {
    mounted();
    expect(await screen.findByText(/Independent Valuation Agent · Kroll Valuation Services/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sign & anchor the independent valuation/i })).toBeTruthy();
    // Shows the NAV range it will anchor ($480–520M).
    expect(screen.getByText('$480.0M – $520.0M')).toBeTruthy();
    // Links to the served document.
    expect(screen.getByRole('link', { name: /View valuation report/i }).getAttribute('href')).toBe(
      '/docs/valuation-report',
    );
  });

  it('creates the ValuationReport with the REAL contentHash + DEMO NAV range', async () => {
    mounted();
    const btn = await screen.findByRole('button', { name: /Sign & anchor the independent valuation/i });
    fireEvent.click(btn);

    await waitFor(() => {
      const actionCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/action'));
      expect(actionCall).toBeTruthy();
    });
    const actionCall = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/action'))!;
    const body = JSON.parse((actionCall[1] as RequestInit).body as string);
    const args = body.commands[0].CreateCommand.createArguments;
    expect(args.contentHash).toBe(VALUATION_SHA256);
    expect(args.contentHash).toBe(DEMO.contentHash);
    expect(args.navLow).toBe(DEMO.navLow);
    expect(args.navHigh).toBe(DEMO.navHigh);
    expect(args.agent).toBe(ME); // signed as the valuer
    expect(args.gp).toBe(GP); // observer = gp, so the Advisor DAG still resolves it
  });
});
