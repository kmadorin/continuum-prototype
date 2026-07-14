// Deal Page tests: the lifecycle derivation maps on-ledger deal state to the six
// stepper stages, and the shared page renders its fund header, KPI row, and tabs for
// a signed-in role with empty ACS reads (the pristine "no deal yet" state).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { SessionProvider } from '../state/WalletSession';
import { reads } from '../lib/useLedger';
import { installBackend } from '../test/mockBackend';
import DealPage, { deriveStages } from './DealPage';

const deal = (args: Record<string, unknown>): ActiveContract => ({ contractId: 'd1', templateId: 't', args });
const stateOf = (stages: ReturnType<typeof deriveStages>) =>
  Object.fromEntries(stages.map((s) => [s.label, s.state]));

describe('deriveStages', () => {
  it('LPAC Consent is the first stage (ILPA order: consent blesses the process before it runs)', () => {
    const stages = deriveStages(null, false, false);
    expect(stages[0].label).toBe('LPAC Consent');
    expect(stages[1].label).toBe('Valuation');
  });

  it('no deal → LPAC Consent active, everything else future', () => {
    const s = stateOf(deriveStages(null, false, false));
    expect(s['LPAC Consent']).toBe('active');
    expect(s.Valuation).toBe('future');
    expect(s.Close).toBe('future');
  });

  it('consented but no valuation → LPAC Consent done, Valuation active', () => {
    const s = stateOf(deriveStages(deal({ cv: 'x', stage: 'Consented' }), false, false));
    expect(s['LPAC Consent']).toBe('done');
    expect(s.Valuation).toBe('active');
    expect(s.Auction).toBe('future');
  });

  it('valuation present but not consented → LPAC Consent active, Valuation done (stages are independent)', () => {
    const s = stateOf(deriveStages(deal({ cv: 'x', stage: 'Setup' }), false, true));
    expect(s.Valuation).toBe('done');
    expect(s['LPAC Consent']).toBe('active');
  });

  it('consented + valuation + clearing price → Auction done, Elections active', () => {
    const s = stateOf(deriveStages(deal({ cv: 'x', stage: 'Consented', clearingPrice: '0.96' }), false, true));
    expect(s['LPAC Consent']).toBe('done');
    expect(s.Valuation).toBe('done');
    expect(s.Auction).toBe('done');
    expect(s.Elections).toBe('active');
  });

  it('settlement receipt present → every stage done', () => {
    const s = stateOf(deriveStages(deal({ cv: 'x', stage: 'Closed', clearingPrice: '0.96' }), true, true));
    expect(Object.values(s).every((v) => v === 'done')).toBe(true);
  });
});

const ME_PARTY = 'continuum-gp-demo::abc123';

describe('DealPage shell', () => {
  beforeEach(() => {
    installBackend({
      me: { role: 'gp', party: ME_PARTY, custodianName: 'Fireblocks — GP treasury' },
      registry: { parties: { gp: ME_PARTY }, custodians: { gp: 'Fireblocks — GP treasury' } },
    });
    vi.spyOn(reads, 'activeContracts').mockResolvedValue([]);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('renders the fund header, KPI row, and tab nav', async () => {
    render(
      <SessionProvider>
        <DealPage />
      </SessionProvider>,
    );
    expect(await screen.findByText('Project Continuum CV I, L.P.')).toBeTruthy();
    expect(screen.getByTestId('kpi-row')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Overview/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Auction & Elections/ })).toBeTruthy();
    // No deal yet → LPAC Consent is the active lifecycle stage (ILPA order).
    await waitFor(() =>
      expect(screen.getAllByText('LPAC Consent')[0].closest('li')?.getAttribute('aria-current')).toBe('step'),
    );
    // Pending KPI placeholders show before any stage completes. The 'Winning bid' tile
    // was deleted globally (vanity derivation), so only Clearing price is Pending Auction.
    await waitFor(() => expect(screen.getByText('— Pending Auction')).toBeTruthy(), { timeout: 2500 });
    expect(screen.getByText('— Pending Issuance')).toBeTruthy();
  });
});

// The GP is not a stakeholder of a SealedBid or an LPElection — it CANNOT read them, and a
// page that polls for them counts zero forever. Oversight has to run on the contentless
// markers (BidFiled / ElectionFiled), which carry no amounts. These tests pin that: the deal
// page must count markers, and it must never have a private contract to leak in the first place.
describe('DealPage oversight — counts what it cannot read', () => {
  const marker = (id: string, templateId: string, args: Record<string, unknown>): ActiveContract => ({
    contractId: id,
    templateId,
    args,
  });

  beforeEach(() => {
    installBackend({
      me: { role: 'gp', party: ME_PARTY, custodianName: 'Fireblocks — GP treasury' },
      registry: { parties: { gp: ME_PARTY }, custodians: { gp: 'Fireblocks — GP treasury' } },
    });
    // The GP's real projection: the deal, one bid marker, two election markers — and NOT one
    // SealedBid or LPElection, because the ledger would never hand it either.
    vi.spyOn(reads, 'activeContracts').mockImplementation(async (_party, opts = {}) => {
      const t = opts.templateId ?? '';
      if (t.endsWith('Deal:ContinuationDeal'))
        return [marker('d1', 't', { cv: 'Meridian CV I', stage: 'Electing', clearingPrice: '0.96', refNav: '500000000.0' })];
      if (t.endsWith('Auction:BidFiled'))
        return [marker('b1', 't', { gp: ME_PARTY, lpac: 'lpac', buyer: 'continuum-buyer-x::ns', dealId: 'M1' })];
      if (t.endsWith('Election:ElectionFiled'))
        return [
          marker('e1', 't', { lp: 'continuum-lpExiting-x::ns', gp: ME_PARTY, dealId: 'M1' }),
          marker('e2', 't', { lp: 'continuum-lpRolling-x::ns', gp: ME_PARTY, dealId: 'M1' }),
        ];
      return [];
    });
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('counts filed elections from the markers', async () => {
    render(
      <SessionProvider>
        <DealPage />
      </SessionProvider>,
    );
    expect(await screen.findByText('2 of 2 responded')).toBeTruthy();
  });

  it('reports the filed bid and elections without their contents', async () => {
    render(
      <SessionProvider>
        <DealPage />
      </SessionProvider>,
    );
    expect(await screen.findByText(/filed a sealed bid — amount blind to you/)).toBeTruthy();
    expect(screen.getAllByText(/filed an election — roll\/sell sealed/)).toHaveLength(2);
    // The old feed printed "elected to SELL" / "elected to ROLL" off the private contract.
    expect(screen.queryByText(/elected to (SELL|ROLL)/)).toBeNull();
  });

  it('never asks the ledger for a contract this seat cannot see', async () => {
    render(
      <SessionProvider>
        <DealPage />
      </SessionProvider>,
    );
    await screen.findByText('2 of 2 responded');
    const asked = vi.mocked(reads.activeContracts).mock.calls.map(([, opts]) => opts?.templateId ?? '');
    expect(asked).not.toContain('Auction:SealedBid');
    expect(asked).not.toContain('Election:LPElection');
  });
});
