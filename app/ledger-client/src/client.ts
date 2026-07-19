// app/ledger-client/src/client.ts
import type { LedgerClient, SubmitReq, ActiveContract, Disclosed } from './types';
export class HttpLedgerClient implements LedgerClient {
  // NOTE: default to a globalThis-bound fetch. A bare `= fetch` default loses its
  // `this` binding when invoked as `this.fetchImpl(...)`, which throws
  // "Illegal invocation" in the browser (native fetch must be called with
  // `this === window`). Node's fetch tolerates it, so this only bites in-browser.
  constructor(private base: string, private fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)) {}
  private async post(path: string, body: unknown) {
    const r = await this.fetchImpl(`${this.base}${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) throw new Error(`${path} → ${r.status}: ${txt}`);
    return JSON.parse(txt);
  }
  // In-flight dedup: a single UI poll fires ~7 activeContracts reads in parallel, each of
  // which calls ledgerEnd() first. Without this they'd issue 7 identical ledger-end GETs per
  // tick. Sharing the one in-flight promise collapses them to a single GET. NOT a time cache
  // — the promise clears as soon as it resolves, so the NEXT tick (and every sequential poll,
  // e.g. pollForContract) still reads a fresh offset. No staleness risk.
  private endInflight?: Promise<{ offset: number }>;
  async ledgerEnd() {
    if (this.endInflight) return this.endInflight;
    this.endInflight = (async () => {
      const r = await this.fetchImpl(`${this.base}/v2/state/ledger-end`);
      const txt = await r.text();
      if (!r.ok) throw new Error(`/v2/state/ledger-end → ${r.status}: ${txt}`);
      return JSON.parse(txt);
    })();
    try {
      return await this.endInflight;
    } finally {
      this.endInflight = undefined;
    }
  }
  async submit(cmd: SubmitReq) { return this.post('/v2/commands/submit-and-wait', cmd); }
  async activeContracts(party: string, opts: { templateId?: string; includeBlob?: boolean } = {}) {
    const { offset } = await this.ledgerEnd();
    const wildcard = { WildcardFilter: { value: { includeCreatedEventBlob: !!opts.includeBlob } } };
    const filter = { filtersByParty: { [party]: { cumulative: [{ identifierFilter: wildcard }] } } };
    const raw = await this.post('/v2/state/active-contracts', { activeAtOffset: offset, filter, verbose: false });
    const items = Array.isArray(raw) ? raw : [raw];
    return items.map((e: any) => {
      const c = e.contractEntry?.JsActiveContract; const ce = c?.createdEvent ?? {};
      return { contractId: ce.contractId, templateId: ce.templateId, args: ce.createArgument ?? {},
        createdEventBlob: ce.createdEventBlob, synchronizerId: c?.synchronizerId } as ActiveContract;
    }).filter(a => a.contractId && (!opts.templateId || a.templateId?.endsWith(opts.templateId)));
  }
  async fetchDisclosed(party: string, contractId: string): Promise<Disclosed> {
    const acs = await this.activeContracts(party, { includeBlob: true });
    const hit = acs.find(a => a.contractId === contractId);
    if (!hit?.createdEventBlob) throw new Error(`no blob for ${contractId}`);
    return { contractId, createdEventBlob: hit.createdEventBlob, templateId: hit.templateId, synchronizerId: hit.synchronizerId! };
  }
}
