import { describe, it, expect } from 'vitest';
import { MockLedgerClient } from './mock';
describe('MockLedgerClient projection', () => {
  it('a sealed bid is visible to the buyer but NOT to another buyer', async () => {
    const m = new MockLedgerClient();
    await m.submit({ commandId: '1', actAs: ['buyerA'], commands: [{ CreateCommand: {
      templateId: '#continuum-contracts:Continuum.Auction:SealedBid', createArguments: { buyer: 'buyerA', price: '0.96' } } }] });
    expect((await m.activeContracts('buyerA')).length).toBe(1);
    expect((await m.activeContracts('buyerB')).length).toBe(0); // peer-blind
  });
  it('returns updateId on submit', async () => {
    const m = new MockLedgerClient();
    const r = await m.submit({ commandId: '2', actAs: ['gp'], commands: [{ CreateCommand: {
      templateId: '#continuum-contracts:Continuum.Deal:ContinuationDeal', createArguments: { gp: 'gp' } } }] });
    expect(r.updateId).toBeTruthy();
  });
});
