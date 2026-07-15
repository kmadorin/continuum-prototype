// app/custody/mock/store.ts
// In-memory ledger for the designer preview. FORKED from web/src/ledger/mock.ts
// (that copy stays put — it is dead code kept only for mock.test.ts /
// PrivacyProof.test.tsx and should be deleted after the hackathon).
//
// This backs BOTH reads and writes so the preview's UI actually reacts to actions:
// useLedger.pollForContract polls the ACS after every submit, so a signer that does
// not materialize creates makes every flow hang and look broken.
// NOTE: the `.js` suffix is REQUIRED — @noble/hashes v2's exports map only exposes
// './sha2.js' / './utils.js' (see ledger-client/src/ed25519.ts:6 for the same import).
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { ActiveContract, JsCommand } from '../../ledger-client/src/types';

/** A contract plus the parties allowed to see it (mock's privacy projection). */
type Stored = ActiveContract & { stakeholders: string[] };

/**
 * A fixture row. `stakeholders` is OPTIONAL and AUTHORITATIVE when present: the real
 * Continuum contracts are multi-stakeholder (e.g. a ValuationReport is seen by valuer +
 * gp + lpac), which the naive observersFor cannot infer. The fixture generator (Task 4)
 * writes the correct set explicitly; seed() falls back to stakeholdersFor only when it is
 * absent (e.g. a unit test author who does not care about projection).
 */
export type SeedContract = { contractId: string; templateId: string; args: Record<string, unknown>; stakeholders?: string[] };

/** Canton-shaped id: '1220' + sha256 hex. Deterministic, so tests can assert on it. */
const cantonId = (s: string): string => `1220${bytesToHex(sha256(new TextEncoder().encode(s)))}`;

export class MockLedgerStore {
  private store: Stored[] = [];
  private seeded: Stored[] = [];
  private seq = 0;
  private trees = new Map<string, unknown>();

  ledgerEnd(): { offset: number } {
    return { offset: this.store.length };
  }

  submit(actAs: string[], commands: JsCommand[]): { updateId: string; completionOffset: number } {
    const updateId = cantonId(`update-${++this.seq}`);
    const events: unknown[] = [];
    for (const c of commands) {
      if ('CreateCommand' in c) {
        const a = c.CreateCommand.createArguments;
        const contractId = cantonId(`contract-${++this.seq}`);
        this.store.push({
          contractId,
          templateId: c.CreateCommand.templateId,
          args: a,
          stakeholders: [...new Set([...actAs, ...observersFor(c.CreateCommand.templateId, a)])],
        });
        events.push({ CreatedTreeEvent: { value: { contractId, templateId: c.CreateCommand.templateId, createArgument: a, signatories: actAs, observers: observersFor(c.CreateCommand.templateId, a) } } });
      } else {
        // Only the choices the UI actually issues. Any other choice is a deliberate
        // no-op — the real Daml gating lives on the real ledger, and simulating it
        // is explicitly out of scope.
        const { contractId, choice, choiceArgument } = c.ExerciseCommand;
        const item = this.store.find((s) => s.contractId === contractId);
        if (item) {
          if (choice === 'SetClearing') item.args = { ...item.args, clearingPrice: choiceArgument.p };
          else if (choice === 'OpenElections') item.args = { ...item.args, stage: 'Electing' };
        }
        events.push({ ExercisedTreeEvent: { value: { contractId, choice, choiceArgument, actingParties: actAs } } });
      }
    }
    this.trees.set(updateId, {
      updateId,
      commandId: `mock-${this.seq}`,
      offset: this.store.length,
      recordTime: MOCK_RECORD_TIME,
      effectiveAt: MOCK_RECORD_TIME,
      synchronizerId: MOCK_SYNCHRONIZER_ID,
      events,
    });
    return { updateId, completionOffset: this.store.length };
  }

  activeContracts(party: string, opts: { templateId?: string } = {}): ActiveContract[] {
    return this.store
      .filter((c) => c.stakeholders.includes(party))
      .filter((c) => !opts.templateId || c.templateId.endsWith(opts.templateId))
      .map(({ stakeholders, ...c }) => c);
  }

  updateTree(updateId: string): unknown | undefined {
    return this.trees.get(updateId);
  }

  /** Replace the store with fixture rows and remember them as the reset baseline. */
  seed(rows: SeedContract[]): void {
    // Explicit stakeholders win (the real contracts are multi-stakeholder); infer only
    // when a row omits them.
    this.seeded = rows.map(({ stakeholders, ...r }) => ({
      ...r,
      stakeholders: stakeholders ?? stakeholdersFor(r.templateId, r.args),
    }));
    this.store = this.seeded.map((c) => ({ ...c }));
  }

  /** Register a canned update tree (fixture audit rows must be inspectable). */
  seedTree(updateId: string, tree: unknown): void {
    this.trees.set(updateId, tree);
  }

  /** Restore the pristine seeded state — backs the preview's Reset button. */
  reset(): void {
    this.store = this.seeded.map((c) => ({ ...c }));
  }
}

export const MOCK_SYNCHRONIZER_ID = 'global-domain::1220mock';
export const MOCK_RECORD_TIME = '2026-07-15T09:00:00Z';

/** Peer-blindness rules, forked from web/src/ledger/mock.ts:62. */
function observersFor(tpl: string, a: Record<string, unknown>): string[] {
  if (tpl.endsWith('SealedBid') || tpl.endsWith('LPElection')) return []; // peer-blind
  if (tpl.endsWith('ContinuationDeal')) {
    const room = (a.room as string[] | undefined) ?? [];
    const owner = a.owner ? [a.owner as string] : [];
    return [...room, ...owner];
  }
  return a.owner ? [a.owner as string] : [];
}

/**
 * Stakeholders for a SEEDED contract when none are given explicitly. Unlike a live
 * submit there is no actAs, so the signatory is inferred from the args.
 */
function stakeholdersFor(tpl: string, a: Record<string, unknown>): string[] {
  const signatory = (a.bidder ?? a.holder ?? a.agent ?? a.lp ?? a.owner ?? a.admin) as string | undefined;
  const base = signatory ? [signatory] : [];
  return [...new Set([...base, ...observersFor(tpl, a)])];
}
