// app/ledger-client/src/client.ts
import type { LedgerClient, SubmitReq, ActiveContract, Disclosed } from './types';
export class HttpLedgerClient implements LedgerClient {
  constructor(private base: string, private fetchImpl: typeof fetch = fetch) {}
  private async post(path: string, body: unknown) {
    const r = await this.fetchImpl(`${this.base}${path}`, { method: 'POST',
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const txt = await r.text();
    if (!r.ok) throw new Error(`${path} → ${r.status}: ${txt}`);
    return JSON.parse(txt);
  }
  async ledgerEnd() {
    const r = await this.fetchImpl(`${this.base}/v2/state/ledger-end`);
    const txt = await r.text();
    if (!r.ok) throw new Error(`/v2/state/ledger-end → ${r.status}: ${txt}`);
    return JSON.parse(txt);
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
