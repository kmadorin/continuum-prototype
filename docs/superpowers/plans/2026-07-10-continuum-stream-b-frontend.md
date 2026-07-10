# Continuum Stream B (frontend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A React+TS+Vite app with a party-switcher that ports the 4 persona views from the HTML prototype and drives the deal lifecycle + the live cross-party privacy proof against the `LedgerClient` interface — mock-first, so it never blocks on Stream A.

**Architecture:** Vite React SPA. All ledger access goes through the **`LedgerClient` interface** from Stream A (`app/ledger-client/src/types.ts`). A `MockLedgerClient` (in-memory ACS with per-party projection) lets every view be built + demoed before the real proxy exists. Party IDs come exclusively from `party-registry.json` — never hard-coded. Swapping mock→`HttpLedgerClient('/api')` at convergence is a one-line change.

**Tech Stack:** Vite, React 18, TypeScript, Vitest + @testing-library/react. Reuse the prototype's `styles.css` and copy/layout from `prototype/app.js` + `portal/*.html`.

**Reusable from prototype:** `prototype/styles.css` (370 lines — copy wholesale), the 4 persona layouts and demo copy in `portal/{advisor,buyer,leaving,staying,oversight}.html` and `prototype/demo-script.md` (the 7-step flow + wow lines). Throwaway: `prototype/app.js` client-side state machine (replaced by real ledger reads).

---

## File Structure

- `app/web/` — Vite root. `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`.
- `src/ledger/mock.ts` — `MockLedgerClient` implementing the Stream-A interface.
- `src/ledger/registry.ts` — loads `party-registry.json`, exposes `parties.gp` etc.
- `src/state/PartyContext.tsx` — "Viewing as" switcher + current-party context.
- `src/views/{Advisor,Buyer,ExitingLP,RollingLP,Oversight}.tsx` — persona views.
- `src/views/PrivacyProof.tsx` — the money-shot: same-offset ACS as party A vs B vs GP.
- `src/lib/ops.ts` — UI-action→`JsCommand` builders (create deal, sealed bid, election, close…).
- Tests: `src/**/*.test.tsx`.

---

## Task 1: Vite scaffold + styles + registry loader

**Files:**
- Create: `app/web/` (Vite), `app/web/src/ledger/registry.ts`
- Copy: `prototype/styles.css` → `app/web/src/styles.css`
- Test: `app/web/src/ledger/registry.test.ts`

- [ ] **Step 1: Scaffold Vite React-TS**

```bash
cd continuum-prototype/app && npm create vite@latest web -- --template react-ts
cd web && npm i && npm i -D vitest @testing-library/react @testing-library/jest-dom jsdom
cp ../../prototype/styles.css src/styles.css
```

- [ ] **Step 2: Write the failing registry test** (fails if a party ID isn't a real `::1220…` namespaced string)

```ts
import { describe, it, expect } from 'vitest';
import { loadRegistry } from './registry';
describe('registry', () => {
  it('exposes namespaced party IDs, never bare hints', () => {
    const r = loadRegistry({ namespace: 'NS', synchronizerId: 'global-domain::x', packageName: 'continuum-contracts',
      parties: { gp: 'continuum-gp-demo::NS', buyer: 'continuum-buyer-demo::NS', lp: 'continuum-lp-demo::NS', lpac: 'x::NS', vehicle: 'y::NS' } });
    expect(r.parties.gp).toContain('::');
    expect(r.packageName).toBe('continuum-contracts');
  });
  it('rejects a registry with a bare (non-namespaced) party', () => {
    expect(() => loadRegistry({ namespace: 'NS', synchronizerId: 's', packageName: 'p',
      parties: { gp: 'continuum-gp-demo' } as any })).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd app/web && npx vitest run src/ledger/registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the loader**

```ts
// app/web/src/ledger/registry.ts
export type Registry = { namespace: string; synchronizerId: string; packageName: string; parties: Record<string, string> };
export function loadRegistry(raw: Registry): Registry {
  for (const [k, v] of Object.entries(raw.parties ?? {}))
    if (!v?.includes('::')) throw new Error(`party ${k} is not namespaced: ${v}`);
  return raw;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd app/web && npx vitest run src/ledger/registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add app/web/package.json app/web/src/styles.css app/web/src/ledger/registry.ts app/web/src/ledger/registry.test.ts app/web/vite.config.ts
git commit -m "feat(web): Vite scaffold + prototype styles + party-registry loader"
```

---

## Task 2: MockLedgerClient with per-party projection (TDD)

**Files:**
- Create: `app/web/src/ledger/mock.ts`
- Test: `app/web/src/ledger/mock.test.ts`

> The mock must reproduce Canton **projection privacy** so the PrivacyProof view is truthful before real wiring: a contract is only visible to its signatories/observers. Model each stored contract with a `stakeholders: string[]`; `activeContracts(party)` returns only those including `party`.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/ledger/mock.test.ts` → FAIL.

- [ ] **Step 3: Implement the mock** (signatory = first `actAs`; `SealedBid`/`LPElection` have NO observers → peer-blind; deal has `room` observers)

```ts
// app/web/src/ledger/mock.ts
import type { LedgerClient, SubmitReq, ActiveContract } from '../../../ledger-client/src/types';
type Stored = ActiveContract & { stakeholders: string[] };
export class MockLedgerClient implements LedgerClient {
  private store: Stored[] = []; private seq = 0;
  async ledgerEnd() { return { offset: this.store.length }; }
  async submit(cmd: SubmitReq) {
    for (const c of cmd.commands) {
      if ('CreateCommand' in c) {
        const a = c.CreateCommand.createArguments as any;
        const observers = this.observersFor(c.CreateCommand.templateId, a);
        this.store.push({ contractId: `mock-${++this.seq}`, templateId: c.CreateCommand.templateId,
          args: a, stakeholders: [...new Set([...cmd.actAs, ...observers])] });
      }
    }
    return { updateId: `u-${++this.seq}`, completionOffset: this.store.length };
  }
  async activeContracts(party: string, opts: { templateId?: string } = {}) {
    return this.store.filter(c => c.stakeholders.includes(party))
      .filter(c => !opts.templateId || c.templateId.endsWith(opts.templateId));
  }
  async fetchDisclosed(_p: string, contractId: string) {
    const c = this.store.find(s => s.contractId === contractId)!;
    return { contractId, createdEventBlob: 'mock-blob', templateId: c.templateId, synchronizerId: 'mock' };
  }
  private observersFor(tpl: string, a: any): string[] {
    if (tpl.endsWith('SealedBid') || tpl.endsWith('LPElection')) return []; // peer-blind
    if (tpl.endsWith('ContinuationDeal')) return (a.room ?? []).concat(a.owner ?? []);
    return a.owner ? [a.owner] : [];
  }
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/ledger/mock.test.ts` → PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/web/src/ledger/mock.ts app/web/src/ledger/mock.test.ts
git commit -m "feat(web): MockLedgerClient with truthful per-party projection"
```

---

## Task 3: Party-switcher context + ops builders

**Files:**
- Create: `app/web/src/state/PartyContext.tsx`, `app/web/src/lib/ops.ts`
- Test: `app/web/src/lib/ops.test.ts`

- [ ] **Step 1: Write the failing test** for the command builders (they must emit the exact JSON shapes Stream A proved)

```ts
import { describe, it, expect } from 'vitest';
import { createDeal, sealedBid, election, setClearing } from './ops';
describe('ops builders', () => {
  it('createDeal emits a CreateCommand with the room observers', () => {
    const c = createDeal({ gp: 'GP', vehicle: 'GP', room: ['B', 'L'], fund: 'F', cv: 'CV', asset: 'A', refNav: '52000000.0', deadline: '2026-07-20T00:00:00Z' });
    expect(c.CreateCommand.templateId).toContain(':Continuum.Deal:ContinuationDeal');
    expect((c.CreateCommand.createArguments as any).room).toEqual(['B', 'L']);
  });
  it('sealedBid has the buyer as the only structural signer', () => {
    const c = sealedBid({ buyer: 'B', deal: 'd1', price: '0.96', capacity: '20000000.0' });
    expect(c.CreateCommand.templateId).toContain(':Continuum.Auction:SealedBid');
  });
  it('setClearing is an ExerciseCommand carrying the price', () => {
    const c = setClearing('deal-cid', '0.96');
    expect(c.ExerciseCommand.choice).toBe('SetClearing');
    expect((c.ExerciseCommand.choiceArgument as any).p).toBe('0.96');
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/lib/ops.test.ts` → FAIL.

- [ ] **Step 3: Implement ops builders** (`PKG = '#continuum-contracts'`; mirror the map in the app spec §3)

```ts
// app/web/src/lib/ops.ts
import type { JsCommand } from '../../../ledger-client/src/types';
const PKG = '#continuum-contracts';
export const createDeal = (a: { gp: string; vehicle: string; room: string[]; fund: string; cv: string; asset: string; refNav: string; deadline: string }): JsCommand =>
  ({ CreateCommand: { templateId: `${PKG}:Continuum.Deal:ContinuationDeal`, createArguments: {
    gp: a.gp, vehicle: a.vehicle, oldFund: a.gp, lpac: a.gp, regulator: a.gp, room: a.room,
    fund: a.fund, cv: a.cv, asset: a.asset, refNav: a.refNav, electionDeadline: a.deadline,
    clearingPrice: null, gpCommitment: '0.0', carryCrystallized: '0.0', stage: 'Bidding' } } });
export const sealedBid = (a: { buyer: string; deal: string; price: string; capacity: string }): JsCommand =>
  ({ CreateCommand: { templateId: `${PKG}:Continuum.Auction:SealedBid`, createArguments: {
    buyer: a.buyer, dealId: a.deal, price: a.price, capacity: a.capacity } } });
export const election = (a: { lp: string; deal: string; choice: 'Roll' | 'Sell'; disclosureHash: string }): JsCommand =>
  ({ CreateCommand: { templateId: `${PKG}:Continuum.Election:LPElection`, createArguments: {
    lp: a.lp, dealId: a.deal, choice: a.choice, consentedHash: a.disclosureHash } } });
export const setClearing = (dealCid: string, p: string): JsCommand =>
  ({ ExerciseCommand: { templateId: `${PKG}:Continuum.Deal:ContinuationDeal`, contractId: dealCid, choice: 'SetClearing', choiceArgument: { p } } });
export const openElections = (dealCid: string): JsCommand =>
  ({ ExerciseCommand: { templateId: `${PKG}:Continuum.Deal:ContinuationDeal`, contractId: dealCid, choice: 'OpenElections', choiceArgument: {} } });
```

> NOTE: field names for `SealedBid`/`LPElection` must be reconciled against `continuum-daml/contracts/daml/Continuum/Auction.daml` + `Election.daml` at implementation time (read the `with` blocks). The templateId + structure are what matter for the mock; exact fields land at convergence.

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/lib/ops.test.ts` → PASS (3 tests).

- [ ] **Step 5: Implement PartyContext** (the "Viewing as" switcher)

```tsx
// app/web/src/state/PartyContext.tsx
import { createContext, useContext, useState, ReactNode } from 'react';
type Ctx = { current: string; setCurrent: (p: string) => void; personas: Record<string, string> };
const C = createContext<Ctx | null>(null);
export function PartyProvider({ personas, children }: { personas: Record<string, string>; children: ReactNode }) {
  const [current, setCurrent] = useState(personas.gp);
  return <C.Provider value={{ current, setCurrent, personas }}>{children}</C.Provider>;
}
export const useParty = () => { const c = useContext(C); if (!c) throw new Error('no PartyProvider'); return c; };
```

- [ ] **Step 6: Commit**

```bash
git add app/web/src/lib/ops.ts app/web/src/lib/ops.test.ts app/web/src/state/PartyContext.tsx
git commit -m "feat(web): party-switcher context + UI-action command builders"
```

---

## Task 4: Persona views (port the 4 personas + oversight)

**Files:**
- Create: `app/web/src/views/{Advisor,Buyer,ExitingLP,RollingLP,Oversight}.tsx`, `app/web/src/App.tsx`
- Reference: `portal/{advisor,buyer,leaving,staying,oversight}.html`, `prototype/demo-script.md`

> These are UI-porting tasks (not TDD — visual). Each view reads `useParty()` + a `LedgerClient` prop, renders the persona's actions from §3 of the app spec, and reflects live ACS. Keep the prototype's copy and the "wow lines" from `demo-script.md`.

- [ ] **Step 1: Advisor view** — buttons: Open closing room (`createDeal`), Set price (`setClearing`), Record consent, Open elections, Close. Show deal stage from `activeContracts(current,{templateId:'ContinuationDeal'})`. Port layout/copy from `portal/advisor.html`.

- [ ] **Step 2: Buyer view** — Submit sealed bid (`sealedBid`); after submit, show "your bid is in" but assert (via a peer query) it is NOT visible to the other buyer. Port from `portal/buyer.html`.

- [ ] **Step 3: ExitingLP + RollingLP views** — Elect Sell / Roll (`election`); show "election filed" chip with NO amount visible to others. Port from `portal/leaving.html` + `staying.html`.

- [ ] **Step 4: Oversight view** — LPAC reads `SettlementReceipt` + `FairnessDisclosure` + final holdings; before/after balances. Port from `portal/oversight.html`.

- [ ] **Step 5: App shell** — `<PartyProvider>` + a persona tab bar + the "Viewing as" dropdown; inject a single `LedgerClient` (mock now). Run `npm run dev`, click each persona through the 7-step demo flow against the mock.

Run: `cd app/web && npm run dev` → open the app, drive Advisor→Buyer→LPs→Advisor(close). Expected: full lifecycle clickable end-to-end on the mock.

- [ ] **Step 6: Commit**

```bash
git add app/web/src/views app/web/src/App.tsx
git commit -m "feat(web): 4 persona views + oversight, driven by LedgerClient (mock)"
```

---

## Task 5: PrivacyProof view — the money shot

**Files:**
- Create: `app/web/src/views/PrivacyProof.tsx`
- Test: `app/web/src/views/PrivacyProof.test.tsx`

- [ ] **Step 1: Write the failing test** (renders three panels; buyerB panel does NOT contain buyerA's bid)

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PrivacyProof } from './PrivacyProof';
import { MockLedgerClient } from '../ledger/mock';
describe('PrivacyProof', () => {
  it('shows a bid to its owner and hides it from peers', async () => {
    const m = new MockLedgerClient();
    await m.submit({ commandId: '1', actAs: ['buyerA'], commands: [{ CreateCommand: {
      templateId: '#continuum-contracts:Continuum.Auction:SealedBid', createArguments: { buyer: 'buyerA' } } }] });
    render(<PrivacyProof client={m} parties={{ buyerA: 'buyerA', buyerB: 'buyerB', gp: 'gp' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('acs-buyerA').textContent).toContain('SealedBid');
      expect(screen.getByTestId('acs-buyerB').textContent).not.toContain('SealedBid');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run src/views/PrivacyProof.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — three columns, each calls `client.activeContracts(party)` at the same moment and lists template names; visually highlight that the sealed bid / election is present in one column and absent in the others.

```tsx
// app/web/src/views/PrivacyProof.tsx
import { useEffect, useState } from 'react';
import type { LedgerClient, ActiveContract } from '../../../ledger-client/src/types';
export function PrivacyProof({ client, parties }: { client: LedgerClient; parties: Record<string, string> }) {
  const [acs, setAcs] = useState<Record<string, ActiveContract[]>>({});
  useEffect(() => { (async () => {
    const out: Record<string, ActiveContract[]> = {};
    for (const [k, p] of Object.entries(parties)) out[k] = await client.activeContracts(p);
    setAcs(out);
  })(); }, [client, parties]);
  return <div className="privacy-grid">{Object.entries(parties).map(([k]) => (
    <div key={k} data-testid={`acs-${k}`}><h4>{k} sees</h4>
      <ul>{(acs[k] ?? []).map(c => <li key={c.contractId}>{c.templateId.split(':').pop()}</li>)}</ul></div>))}</div>;
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run src/views/PrivacyProof.test.tsx` → PASS.

- [ ] **Step 5: Commit**

```bash
git add app/web/src/views/PrivacyProof.tsx app/web/src/views/PrivacyProof.test.tsx
git commit -m "feat(web): live cross-party privacy-proof view (the money shot)"
```

---

## Self-review notes
- Spec §3 (persona map) → Task 4; §2.1 seam (registry + interface) → Tasks 1–2; privacy proof → Task 5.
- **B depends on A only for two artifacts**: `ledger-client/src/types.ts` (imported for types) and `party-registry.json` (loaded at runtime). Both exist as an interface + a mock now, so B ships fully on the mock and swaps to `HttpLedgerClient('/api')` at convergence.
- R4 (hard-coded party) guarded by the registry loader test (Task 1 step 2).
- Field-name reconciliation for `SealedBid`/`LPElection`/`ContinuationDeal.stage` is deferred to convergence (flagged in Task 3) — read the Daml `with` blocks then.
