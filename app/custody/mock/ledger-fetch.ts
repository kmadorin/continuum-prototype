// app/custody/mock/ledger-fetch.ts
// A `fetch` that speaks the Canton JSON Ledger API v2 wire shape against MockLedgerStore.
// This is the SINGLE interception point for the whole backend: deps.fetchImpl is used by
// both the /api/* reads proxy (app.ts:271) and /ledger/update/:updateId (app.ts:406).
//
// The `.invalid` TLD is reserved (RFC 2606) and cannot resolve — so a request that
// slips past this interceptor fails loudly instead of reaching a real host.
import { MOCK_SYNCHRONIZER_ID, type MockLedgerStore } from './store';

export const MOCK_LEDGER_BASE = 'https://mock-ledger.invalid';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Read the party the /api proxy forced into the ACS filter (app.ts:133 forceParty). */
function partyFromFilter(body: any): string | undefined {
  return Object.keys(body?.filter?.filtersByParty ?? {})[0];
}

export function makeMockFetch(store: MockLedgerStore): typeof fetch {
  return (async (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const path = url.replace(MOCK_LEDGER_BASE, '').split('?')[0];
    const body = init.body ? JSON.parse(init.body as string) : undefined;

    if (path === '/v2/state/ledger-end') return json(store.ledgerEnd());

    if (path === '/v2/state/active-contracts') {
      const party = partyFromFilter(body);
      if (!party) return json([]);
      // HttpLedgerClient.activeContracts (client.ts:23) unwraps exactly this shape.
      // createdEventBlob is deliberately absent: nothing in web/src calls
      // fetchDisclosed, and the blob is signed devnet bytes we cannot synthesize.
      return json(
        store.activeContracts(party).map((c) => ({
          contractEntry: {
            JsActiveContract: {
              createdEvent: { contractId: c.contractId, templateId: c.templateId, createArgument: c.args },
              synchronizerId: MOCK_SYNCHRONIZER_ID,
            },
          },
        })),
      );
    }

    if (path === '/v2/updates/update-by-id') {
      const tree = store.updateTree(body?.updateId);
      return tree ? json(tree) : json({ error: 'update not found' }, 404);
    }

    throw new Error(`mock ledger: unhandled path ${path}`);
  }) as unknown as typeof fetch;
}
