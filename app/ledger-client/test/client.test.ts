import { describe, it, expect, vi } from 'vitest';
import { HttpLedgerClient } from '../src/client';

const okJson = (obj: any) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });

describe('HttpLedgerClient', () => {
  it('ledgerEnd GETs /v2/state/ledger-end', async () => {
    const f = vi.fn(async () => okJson({ offset: 7 })) as any;
    const c = new HttpLedgerClient('http://p', f);
    expect(await c.ledgerEnd()).toEqual({ offset: 7 });
    expect(f.mock.calls[0][0]).toBe('http://p/v2/state/ledger-end');
  });
  it('submit posts submit-and-wait with actAs array + disclosedContracts', async () => {
    const f = vi.fn(async () => okJson({ updateId: 'u1', completionOffset: 9 })) as any;
    const c = new HttpLedgerClient('http://p', f);
    const r = await c.submit({ commandId: 'c1', actAs: ['A', 'B'],
      commands: [{ CreateCommand: { templateId: '#pkg:M:T', createArguments: { meta_: {} } } }],
      disclosedContracts: [{ contractId: 'x', createdEventBlob: 'b', templateId: '#pkg:M:T', synchronizerId: 's' }] });
    expect(r.updateId).toBe('u1');
    const body = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(body.actAs).toEqual(['A', 'B']);
    expect(body.disclosedContracts).toHaveLength(1);
    expect(f.mock.calls[0][0]).toBe('http://p/v2/commands/submit-and-wait');
  });
  it('activeContracts posts with activeAtOffset + party filter and includeBlob flag', async () => {
    let call = 0;
    const f = vi.fn(async () => (call++ === 0 ? okJson({ offset: 100 })
      : okJson([{ contractEntry: { JsActiveContract: { createdEvent: { contractId: 'k', templateId: '#pkg:M:T', createArgument: {} } } } }]))) as any;
    const c = new HttpLedgerClient('http://p', f);
    const out = await c.activeContracts('P', { includeBlob: true });
    const body = JSON.parse((f.mock.calls[1][1] as any).body);
    expect(body.activeAtOffset).toBe(100);
    expect(body.filter.filtersByParty.P.cumulative[0].identifierFilter.WildcardFilter.value.includeCreatedEventBlob).toBe(true);
    expect(out[0].contractId).toBe('k');
  });
});
