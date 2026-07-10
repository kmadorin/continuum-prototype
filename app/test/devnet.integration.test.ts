import { describe, it, expect } from 'vitest';
import { HttpLedgerClient } from '../ledger-client/src/client';
const NS = process.env.FN_NAMESPACE!;
const run = process.env.FN_SECRET ? describe : describe.skip; // requires proxy running on :8788
run('devnet integration', () => {
  const c = new HttpLedgerClient('http://localhost:8788');
  it('ledgerEnd returns an offset', async () => {
    const e = await c.ledgerEnd(); expect(typeof e.offset).toBe('number');
  });
  it('creates a RegistryHolding and reads it back', async () => {
    const gp = `continuum-gp-demo::${NS}`, buyer = `continuum-buyer-demo::${NS}`;
    const id = `it-${Date.now()}`;
    const r = await c.submit({ commandId: id, actAs: [gp], commands: [{ CreateCommand: {
      templateId: '#continuum-contracts:Continuum.Registry:RegistryHolding',
      createArguments: { admin: gp, owner: buyer, instId: 'IT-USD', amount: '1.0', locked: false, meta_: {} } } }] });
    expect(r.updateId).toBeTruthy();
    const acs = await c.activeContracts(gp, { templateId: 'RegistryHolding' });
    expect(acs.some(a => (a.args as any).instId === 'IT-USD')).toBe(true);
  });
});
