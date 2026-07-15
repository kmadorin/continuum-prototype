import { describe, it, expect } from 'vitest';
import { MockLedgerStore } from './store';
import { makeMockFetch, MOCK_LEDGER_BASE } from './ledger-fetch';

const GP = 'gp::1220aaaa';
const BUYER = 'buyer::1220bbbb';
const createDeal = {
  CreateCommand: {
    templateId: '#continuum:Continuum.Deal:ContinuationDeal',
    createArguments: { dealId: 'M1', owner: GP, room: [BUYER], stage: 'Open' },
  },
};

const acsBody = (party: string) => JSON.stringify({
  activeAtOffset: 1,
  filter: { filtersByParty: { [party]: { cumulative: [{ identifierFilter: { WildcardFilter: { value: { includeCreatedEventBlob: false } } } }] } } },
  verbose: false,
});

describe('makeMockFetch', () => {
  it('serves ledger-end', async () => {
    const store = new MockLedgerStore();
    store.submit([GP], [createDeal]);
    const f = makeMockFetch(store);
    const r = await f(`${MOCK_LEDGER_BASE}/v2/state/ledger-end`);
    expect(await r.json()).toEqual({ offset: 1 });
  });

  it('serves active-contracts in the real wire shape', async () => {
    const store = new MockLedgerStore();
    store.submit([GP], [createDeal]);
    const f = makeMockFetch(store);
    const r = await f(`${MOCK_LEDGER_BASE}/v2/state/active-contracts`, { method: 'POST', body: acsBody(GP) });
    const body = await r.json();
    expect(Array.isArray(body)).toBe(true);
    const ce = body[0].contractEntry.JsActiveContract.createdEvent;
    expect(ce.createArgument.dealId).toBe('M1');
    expect(ce.createdEventBlob).toBeUndefined();
  });

  it('honours the party filter (privacy projection)', async () => {
    const store = new MockLedgerStore();
    store.submit([BUYER], [{ CreateCommand: { templateId: '#continuum:Continuum.Auction:SealedBid', createArguments: { bidder: BUYER, price: '0.96' } } }]);
    const f = makeMockFetch(store);
    const asGp = await (await f(`${MOCK_LEDGER_BASE}/v2/state/active-contracts`, { method: 'POST', body: acsBody(GP) })).json();
    expect(asGp).toHaveLength(0);
    const asBuyer = await (await f(`${MOCK_LEDGER_BASE}/v2/state/active-contracts`, { method: 'POST', body: acsBody(BUYER) })).json();
    expect(asBuyer).toHaveLength(1);
  });

  it('serves update-by-id from the tree map', async () => {
    const store = new MockLedgerStore();
    const { updateId } = store.submit([GP], [createDeal]);
    const f = makeMockFetch(store);
    const r = await f(`${MOCK_LEDGER_BASE}/v2/updates/update-by-id`, { method: 'POST', body: JSON.stringify({ updateId, updateFormat: {} }) });
    expect((await r.json()).updateId).toBe(updateId);
  });

  it('404s an unknown updateId', async () => {
    const f = makeMockFetch(new MockLedgerStore());
    const r = await f(`${MOCK_LEDGER_BASE}/v2/updates/update-by-id`, { method: 'POST', body: JSON.stringify({ updateId: 'nope', updateFormat: {} }) });
    expect(r.status).toBe(404);
  });

  it('throws on an unhandled ledger path rather than leaking', async () => {
    const f = makeMockFetch(new MockLedgerStore());
    await expect(f(`${MOCK_LEDGER_BASE}/v2/commands/submit-and-wait`, { method: 'POST', body: '{}' })).rejects.toThrow(/unhandled/i);
  });
});
