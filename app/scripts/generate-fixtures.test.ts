import { describe, it, expect } from 'vitest';
import { acs, audit, updates } from './generate-fixtures';
import { MOCK_PARTIES, ROLES } from '../custody/mock/fixtures';
import { MockLedgerStore } from '../custody/mock/store';

describe('generated fixtures', () => {
  it('pins every dealId/cv to the epoch-1 keys', () => {
    for (const row of acs) {
      if ('dealId' in row.args) expect([('M1'), ('Meridian CV I')]).toContain(row.args.dealId as string);
    }
    const deal = acs.find((r) => r.templateId.endsWith('Deal:ContinuationDeal'))!;
    expect(deal.args.cv).toBe('Meridian CV I');
    expect(deal.args.clearingPrice).toBe('0.96');
  });

  it('makes every seat that needs content see something (no empty views)', () => {
    const store = new MockLedgerStore();
    store.seed(acs);
    for (const role of ROLES) {
      expect(store.activeContracts(MOCK_PARTIES[role]).length, `${role} view is empty`).toBeGreaterThan(0);
    }
  });

  it('projects the ValuationReport to gp (the NAV tile) — the classic empty-tile bug', () => {
    const store = new MockLedgerStore();
    store.seed(acs);
    expect(store.activeContracts(MOCK_PARTIES.gp, { templateId: 'Valuation:ValuationReport' })).toHaveLength(1);
  });

  it('keeps SealedBid peer-blind (buyer sees it, gp does not)', () => {
    const store = new MockLedgerStore();
    store.seed(acs);
    expect(store.activeContracts(MOCK_PARTIES.buyer, { templateId: 'Auction:SealedBid' })).toHaveLength(1);
    expect(store.activeContracts(MOCK_PARTIES.gp, { templateId: 'Auction:SealedBid' })).toHaveLength(0);
  });

  it('every audit updateId is inspectable, and there is a failed specimen', () => {
    for (const row of audit) expect(updates[row.updateId!]).toBeDefined();
    expect(audit.some((r) => r.outcome === 'failed')).toBe(true);
  });

  it('leaks no key material', () => {
    const blob = JSON.stringify({ acs, audit, updates });
    expect(blob).not.toMatch(/mnemonic|abandon abandon|FN_SECRET/);
  });
});
