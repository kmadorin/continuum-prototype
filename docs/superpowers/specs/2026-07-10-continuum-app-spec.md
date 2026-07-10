# Continuum — App Spec: devnet-wired live product (React + JSON Ledger API v2)

**Date:** 2026-07-10 · **Status:** Approved (deploy gate + architecture spikes GREEN) → ready for plans
**Depends on:** `docs/devnet-deploy-test-RESULT.md` (proven deploy + spike recipes),
`docs/superpowers/specs/2026-07-09-continuum-onchain-spec.md` (the contracts, source of truth).
**Deadline:** Mon 13 Jul 2026 12:59 BST (~3 days). Floor first.

---

## 1. Goal & the qualifying floor

Turn the static HTML prototype into a **clickable live product** that drives our **already-deployed
Daml contracts on the shared 5N Canton devnet validator**. Hackathon FLOOR = BOTH mandatory bars:
(a) contracts running on-ledger on devnet [✅ already proven], AND (b) a hosted live-product link
driving ≥1 real flow.

**Scope decision (Fable-advised, verified feasible today):**
- **FLOOR:** full deal lifecycle up to elections on devnet via the JSON client + a thin React UI
  with a **party-switcher**, PLUS the **live cross-party privacy proof** (sealed bids + private
  elections invisible to peers, queried live on devnet), PLUS the **REAL atomic `Close` at minimal
  cast — 1 buyer + 1 LP** (one transaction, multi-`actAs`, `disclosedContracts`). Same code path as
  the full close; scaling legs is a loop.
- **TARGET:** `Close` scaled to full demo cast (2 buyers, 2–3 LPs, 4+ legs); UI renders the single
  transaction fanning out (event tree = the money screenshot); before/after balance panel.
- **STRETCH:** WebSocket live ACS updates; pro-rata/waterfall viz; deal-#2 flywheel; Splice wallet cash leg.

**Non-goals:** Java backend (cn-quickstart); reimplementing settlement in the app (Daml is source of
truth); per-user wallet auth (noted as the production answer, out of scope for demo).

---

## 2. Architecture

```
 Browser (React+TS+Vite)  ──HTTPS──▶  Reverse-proxy (Node/serverless)  ──HTTPS+Bearer──▶  5N devnet
   party-switcher UI                    injects M2M JWT (8h refresh)                       JSON Ledger
   ledger-client (typed)                forwards /v2/*  (solves CORS + secret-hiding)      API v2
   reads party-registry.json            NEVER ships the secret to the browser
```

**Two decisions locked by today's spikes:**
1. **Direct ledger access, no Java backend.** React → JSON Ledger API v2 via a typed TS ledger-client
   (hand-written JSON payloads; `codegen-js`/`@c7/ledger` optional later). Verified: create, exercise,
   multi-`actAs`, `disclosedContracts`, ACS query all work over pure JSON.
2. **Reverse-proxy is on the FLOOR, not optional.** A pure-browser app both leaks the shared plaintext
   secret AND is CORS-blocked. The proxy holds the secret server-side, does the OIDC exchange, refreshes
   the 8h JWT, injects `Authorization: Bearer`, and forwards all `/v2/*`. Browser talks ONLY to the proxy.

### 2.1 The A/B seam — TWO artifacts (make parallel work safe)

1. **`LedgerClient` TS interface** (Stream B mocks it; Stream A implements it). Shape below (§4).
2. **`party-registry.json`** — real devnet party IDs + persona→party map, EMITTED by Stream A after
   allocation. Stream B reads party IDs from this file, **never hard-codes party strings** (a fake
   string passes a mock and breaks on real wiring). Shape:
   ```json
   { "namespace": "1220a14c…acf8",
     "synchronizerId": "global-domain::1220b…",
     "parties": { "gp": "continuum-gp-demo::…", "buyer": "continuum-buyer-demo::…",
                  "lp": "continuum-lp-demo::…", "lpac": "…", "vehicle": "…" },
     "packageName": "continuum-contracts" }
   ```

---

## 3. Personas → UI views → Daml command/query map

4 persona views ported from `prototype/`/`portal/` + a **party-switcher** (act-as different parties to
show projection privacy). MVP party model collapses gp=vehicle=oldFund=registry admin into `gp`
(per on-chain spec §4.1); distinct: `buyer`, `lp` (exiting), `lp2` (rolling, target), `lpac`.

| # | Persona view | UI action | Ledger op (JSON) | actAs | Notes |
|---|---|---|---|---|---|
| 1 | Advisor/GP | Open closing room | `CreateCommand ContinuationDeal` | gp | gp+vehicle collapsed → single actAs |
| 2 | Buyer | Submit sealed bid | `CreateCommand SealedBid` | buyer | buyer sole signatory → peer-blind |
| 3 | Advisor/GP | Select lead / set price | `Exercise SetClearing {p}` on deal | gp | |
| 4 | Advisor/GP | Record LPAC consent | `Exercise RecordConsent` | gp | (LPAC `Grant` in target) |
| 5 | Advisor/GP | Open elections | `Exercise OpenElections` | gp | gated: consented + clearing set |
| 6 | Investor (exiting) | Elect sell | `CreateCommand LPElection` | lp | LP sole signatory → peer-blind |
| 6b| Investor (rolling) | Elect roll | `CreateCommand LPElection` | lp2 | target |
| 7 | **All** (privacy proof) | "Show what each party sees" | `POST /v2/state/active-contracts` per party | each | **the money shot** — sealed bids/elections absent from peers' projections |
| 8 | Advisor/GP | Close — all at once | `Exercise Close {basisCid, legExecs, burns, fairnessHash}` | gp (+buyer+lp) | multi-actAs + `disclosedContracts`; floor=1 buyer/1 lp |
| 9 | LPAC oversight / all | Verify settlement | read `SettlementReceipt`, `FairnessDisclosure`, `Allocation`, `RegistryHolding` | lpac/all | before/after balances |

**Read models** (all `POST /v2/state/active-contracts`, filter by party, `WildcardFilter` or template filter):
deal stage, holdings per owner, allocations, receipts, fairness disclosure. Set `includeCreatedEventBlob:true`
only when a cid must be re-used as a `disclosedContracts` input.

**Pre-flow setup** (Stream A `seed` script, run once against devnet before demo): allocate parties →
mint `RegistryHolding`s (mock-USDC to buyer, CV-unit treasury to gp/vehicle, asset to gp) → create
`RegistryAllocationFactory` → publish `ValuationReport`/`FairnessOpinion`/`DisclosureDocument`/`PurchaseAgreement`/`IssuanceBasis` →
create `ContinuationDeal`. Emits `party-registry.json`. Mirrors the tested `Seed.daml` orchestration but as JSON.

---

## 4. LedgerClient interface (the A/B contract)

```ts
// Verified JSON shapes — see docs/devnet-deploy-test-RESULT.md
interface LedgerClient {
  ledgerEnd(): Promise<{ offset: number }>;
  // create/exercise; actAs is an array (multi-party proven). Returns updateId.
  submit(cmd: { commandId: string; actAs: string[]; readAs?: string[];
                commands: JsCommand[]; disclosedContracts?: Disclosed[] }): Promise<{ updateId: string; completionOffset: number }>;
  // ACS query at an offset; includeBlob=true to harvest createdEventBlob for disclosure.
  activeContracts(party: string, opts?: { templateId?: string; includeBlob?: boolean }): Promise<ActiveContract[]>;
  // convenience: fetch {contractId, createdEventBlob, templateId, synchronizerId} for a cid to disclose.
  fetchDisclosed(party: string, cid: string): Promise<Disclosed>;
}
type JsCommand =
  | { CreateCommand: { templateId: string; createArguments: Record<string, unknown> } }
  | { ExerciseCommand: { templateId: string; contractId: string; choice: string; choiceArgument: Record<string, unknown> } };
type Disclosed = { contractId: string; createdEventBlob: string; templateId: string; synchronizerId: string };
```

**Gotchas baked in (proven today):** Daml `TextMap` → JSON object `{}` not `[]`; `templateId` uses
`#package-name:Module:Entity`; interface choices exercise via the interface id as `templateId`;
`AllocationFactory_PublicFetch` takes NO `extraArgs`; `active-contracts` is POST with body
`{activeAtOffset, filter, verbose}`; passing `userId` at party allocation is what grants act-as.

---

## 5. Workstreams (parallel; the seam makes it safe)

- **Stream A — chain/deploy** (person 1): reverse-proxy; `LedgerClient` impl (hand-written JSON incl.
  `disclosedContracts`); `seed` script → emits `party-registry.json`; one command + one query proven
  green from the client; then the minimal atomic `Close` (1 buyer/1 lp).
- **Stream B — frontend** (person 2): React+TS+Vite scaffold; port 4 persona views + party-switcher
  from HTML; wire to the `LedgerClient` **interface** (mock first, so B never blocks on A); the privacy-proof view.
- **Convergence:** point B's UI at A's real proxy + `party-registry.json`; run one full deal on devnet
  through the UI; verify conservation on-ledger.
- **Submission (floor-critical):** public repo (secret gitignored), deck, 3-min video, **hosted live
  product** (Vercel/Netlify for the React app + serverless proxy) — the live-product link is a HARD bar.

**Sequencing:** A's proxy+client and B's scaffold+port run in parallel from t=0. They converge at wiring
(needs proxy live + `party-registry.json`). Only the final atomic `Close` in the UI is strictly after
A proves `Close` from the client.

---

## 6. Top risks

- **R1 — reverse-proxy CORS/refresh.** Mitigate: proxy is task 1 of Stream A; prove `ledger-end` through
  it from the browser before anything else.
- **R2 — full `Close` JSON assembly** (legs, ExecDelegation co-sign, disclosedContracts). Mechanism
  proven (spikes GREEN); risk is assembly labor. Mitigate: floor at 1 buyer/1 lp; scale in target.
- **R3 — 8h token expiry mid-demo.** Mitigate: proxy refreshes on 401/expiry; test a forced refresh.
- **R4 — party-registry drift** (B hard-codes a string). Mitigate: B reads the JSON file; a lint/test
  asserts no `::1220` literals in UI source.
