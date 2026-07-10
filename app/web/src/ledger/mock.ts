import type { LedgerClient, SubmitReq, ActiveContract } from '../../../ledger-client/src/types';

type Stored = ActiveContract & { stakeholders: string[] };

export class MockLedgerClient implements LedgerClient {
  private store: Stored[] = [];
  private seq = 0;

  async ledgerEnd(): Promise<{ offset: number }> {
    return { offset: this.store.length };
  }

  async submit(cmd: SubmitReq): Promise<{ updateId: string; completionOffset: number }> {
    for (const c of cmd.commands) {
      if ('CreateCommand' in c) {
        const a = c.CreateCommand.createArguments as Record<string, unknown>;
        const observers = this.observersFor(c.CreateCommand.templateId, a);
        this.store.push({
          contractId: `mock-${++this.seq}`,
          templateId: c.CreateCommand.templateId,
          args: a,
          stakeholders: [...new Set([...cmd.actAs, ...observers])],
        });
      }
      // ExerciseCommand: no-op for now (YAGNI) — must not throw.
    }
    return { updateId: `u-${++this.seq}`, completionOffset: this.store.length };
  }

  async activeContracts(
    party: string,
    opts: { templateId?: string; includeBlob?: boolean } = {}
  ): Promise<ActiveContract[]> {
    return this.store
      .filter((c) => c.stakeholders.includes(party))
      .filter((c) => !opts.templateId || c.templateId.endsWith(opts.templateId))
      .map(({ stakeholders, ...c }) => c);
  }

  async fetchDisclosed(_party: string, contractId: string) {
    const c = this.store.find((s) => s.contractId === contractId)!;
    return { contractId, createdEventBlob: 'mock-blob', templateId: c.templateId, synchronizerId: 'mock' };
  }

  private observersFor(tpl: string, a: Record<string, unknown>): string[] {
    if (tpl.endsWith('SealedBid') || tpl.endsWith('LPElection')) return []; // peer-blind
    if (tpl.endsWith('ContinuationDeal')) {
      const room = (a.room as string[] | undefined) ?? [];
      const owner = a.owner ? [a.owner as string] : [];
      return [...room, ...owner];
    }
    return a.owner ? [a.owner as string] : [];
  }
}
