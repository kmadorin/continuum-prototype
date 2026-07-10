# Devnet deploy gating test — GREEN ✅

**Date:** 2026-07-10 · **Validator:** shared 5N Seaport devnet
(`https://ledger-api.validator.devnet.sandbox.fivenorth.io`)
**Result:** a Continuum `RegistryHolding` contract is live on-ledger, created + queried via the
raw JSON Ledger API v2 with the M2M token. This is the pass/fail gate for the whole submission
— it passes. Everything below is the **proven, reproducible recipe**.

---

## Key resolved facts (don't re-litigate)

| Question (from handoff) | Answer (verified) |
|---|---|
| Token privilege level | **`ParticipantAdmin`** present (rights kinds: `CanActAs`, `CanReadAs`, `CanExecuteAs`, `CanExecuteAsAnyParty`, `CanReadAsAnyParty`, `ParticipantAdmin`). **DAR upload + party allocation via API work — NO Seaport-UI fallback needed.** |
| Version skew (LF-2.1 / SDK 3.4.11 DAR on 3.5.7 validator) | **Non-issue.** `POST /v2/dars/validate` → 200, upload → 200, create → 200. No rebuild to 3.5.x required. |
| OIDC secret | PDF glyph trap: one char in the secret is an ambiguous **capital `I`** where the visual PDF render looks like a lowercase `l`. Extract the exact string with `pdftotext` (not the visual render). Secret value lives ONLY in gitignored `app/.env` — never in docs. |
| Token TTL | `expires_in` = 28800 s (8h). Build refresh. |
| Ledger user | JWT `sub` = `"6"`, username `otc-canton-fund-oauth`, primaryParty `5nsandbox-devnet-2::1220a14…acf8`. |
| Participant namespace | `1220a14ca128063b8dc9d1ebb0bd22633be9f2168500f4dbc1ecaeb1855b14e5acf8` — every party allocated here gets this suffix. |
| Shared validator | our token already acts-as **1000+ parties** from other teams. Namespace all our party hints (`continuum-*`) to avoid collisions. |

## ⚠️ Secret handling

The client secret is a **shared plaintext credential** and the submission repo is **PUBLIC**.
Keep it OUT of git. For local: env var. For the hosted live product: the reverse-proxy holds it
server-side (see app spec). It is currently in `~/.claude/.../scratchpad/.fn_secret` (gitignored temp),
NOT in the repo.

---

## Reproducible recipe

### 0. Build
```
cd continuum-daml && ~/.local/bin/dpm build --all
# → contracts/.daml/dist/continuum-contracts-1.0.0.dar
```

### 1. Get token (8h JWT)
```
curl -s -X POST 'https://auth.sandbox.fivenorth.io/application/o/token/' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials' \
  --data 'client_id=validator-devnet-m2m' \
  --data-urlencode "client_secret=$FN_SECRET" \
  --data 'audience=validator-devnet-m2m' \
  --data 'scope=daml_ledger_api'
# → {"access_token":"...","expires_in":28800}
```

### 2. Sanity + privilege
```
GET  /v2/state/ledger-end          → 200 {"offset":...}
GET  /v2/authenticated-user        → user "6"
GET  /v2/users/6/rights            → contains ParticipantAdmin
```

### 3. Upload DAR  (needs ParticipantAdmin)
```
POST /v2/dars   Content-Type: application/octet-stream   --data-binary @continuum-contracts-1.0.0.dar
# → 200 {}      (optional pre-check: POST /v2/dars/validate → 200)
```

### 4. Allocate parties  (needs ParticipantAdmin; pass userId to bind act-as)
```
POST /v2/parties  {"partyIdHint":"continuum-gp-demo","userId":"6"}     → continuum-gp-demo::<ns>
POST /v2/parties  {"partyIdHint":"continuum-buyer-demo","userId":"6"}  → continuum-buyer-demo::<ns>
```
Passing `userId:"6"` (the token's `sub`) is what gives the token `act_as` on the new party.
Without it → step 5 returns PERMISSION_DENIED.

### 5. Create a contract  (actAs the party)
```
POST /v2/commands/submit-and-wait
{
  "commandId": "<unique>",
  "actAs": ["continuum-gp-demo::<ns>"],
  "commands": [{ "CreateCommand": {
    "templateId": "#continuum-contracts:Continuum.Registry:RegistryHolding",
    "createArguments": {
      "admin":"continuum-gp-demo::<ns>", "owner":"continuum-buyer-demo::<ns>",
      "instId":"USD-mock", "amount":"1000000.0", "locked":false, "meta_":{}
    }}}]
}
# → 200 {"updateId":"1220556d…","completionOffset":4186028}
```
**Gotcha:** Daml `TextMap` serializes as a JSON **object** `{}`, NOT array `[]`.
Empty `[]` → `LEDGER_API_INTERNAL_ERROR "Expected ujson.Obj"`.
`templateId` uses the `#package-name:Module:Entity` form (package-name, not package-id hash).

### 6. Query back  (POST, not GET; body needs activeAtOffset + filter)
```
POST /v2/state/active-contracts
{ "activeAtOffset": <ledger-end offset>,
  "filter": {"filtersByParty": {"<gp party>": {"cumulative":[
     {"identifierFilter":{"WildcardFilter":{"value":{"includeCreatedEventBlob":false}}}}]}}},
  "verbose": false }
# → RegistryHolding: cid 00ffd16fea…, instId USD-mock, amount 1000000.0000000000, owner continuum-buyer-demo
```

---

## Redeploy — continuum-contracts 1.1.0 (real-wallet propose-accept delta) ✅

2026-07-10: rebuilt + redeployed as **1.1.0** (added `ExecDelegationProposal` + `OldFundInterestOffer`
propose-accept wrappers + `RecordConsent` recontrolled to `lpac` — see the wallet-portal spec). Package
version bumped 1.0.0→1.1.0 so vetting accepts the new hash. `POST /v2/dars/validate` → 200,
`POST /v2/dars` → 200; verified `#continuum-contracts:Continuum.Registry:ExecDelegationProposal` creates
on-ledger (updateId `1220c7c2e7c5…`). Both 1.0.0 and 1.1.0 now vetted on the validator.

## De-risk spikes — the atomic Close is feasible over pure JSON ✅

Fable (advisor) flagged the single architecture unknown: can one M2M token do multi-party
`actAs` in a single command, and can `disclosedContracts` be assembled from JSON reads? Both
verified on devnet 2026-07-10:

| Spike | Command | Result |
|---|---|---|
| **Multi-`actAs`** | create `ProbeInterest` (signatory `admin,lp`) with `actAs:[gp,lp]` | ✅ 200, one tx |
| **`disclosedContracts`** | `actAs:[buyer]` (non-stakeholder) exercises `AllocationFactory_PublicFetch` on a `RegistryAllocationFactory` created by `gp`, factory passed as `disclosedContracts` | ✅ 200 |

Recipe for `disclosedContracts`: query ACS with `includeCreatedEventBlob:true` → take
`{contractId, createdEventBlob, templateId, synchronizerId}` → put in top-level
`disclosedContracts:[...]` of the submit body. Exercise an **interface** choice by passing the
interface id as `templateId` (e.g.
`#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory`).
**Gotcha:** `AllocationFactory_PublicFetch` takes only `{expectedAdmin, actor}` — NO `extraArgs`
(sending it → `INVALID_ARGUMENT Unexpected fields: extraArgs`). Other choices (`_Allocate`) do take `extraArgs`.

**Conclusion:** the full atomic `Close` (multi-`actAs` gp+buyer+lp, `disclosedContracts` for
factory/allocation/ExecDelegation legs) is plumbing over JSON, NOT gRPC-blocked. Daml Script's
gRPC-only limitation is irrelevant — we never need it against devnet. Scale to full 4-leg is a loop.

## Not yet exercised (bake into the ledger client — see app spec)

- **`disclosedContracts`**: factory/allocation/interface choices are exercised on contracts the
  actor may not be a stakeholder of → each such command needs `disclosedContracts` (fetch CID +
  `createdEventBlob` from active-contracts with `includeCreatedEventBlob:true`). Most likely reason
  a correct-looking submit later fails. Not needed for the plain `CreateCommand` above.
- Multi-party `Close` with the `ExecDelegation` / `Allocation_ExecuteTransfer` batch.

---

## ✅ ACHIEVED — minimal atomic `Close` proven live on devnet (Task 7)

`app/scripts/close-minimal.ts` drives a fresh `ContinuationDeal` `Setup → Electing`, builds the
antecedent DAG + `IssuanceBasis`, allocates **2 legs** (CV units → buyer, USDC → exiting LP) against
the disclosed `RegistryAllocationFactory`, co-signs the `ExecDelegation`s + burn authority
(`AcceptedParticipation` + `OldFundInterest`), then exercises `Deal.Close` in **ONE transaction**.

Live run (all-or-nothing):

| Fact | Value |
|---|---|
| **`Close` updateId** | `12209ce8f261d9c2b70a3ecdfc6d8afda3e2c28da20e8f627b9ae6a34fd89905ec5d` (single tx) |
| **`SettlementReceipt`** | `009ca1e4da2b5d9bf0f…463ca9e05` — `totalUnits=4800000.0`, `clearingPct=0.96` |
| buyer CV (`MERIDIAN-CV-I`) | `0 → 4800000` (Δ +4.8M) |
| lp USDC | `0 → 4608000` (Δ +4.608M) |
| lp `OldFundInterest` | **BURNED** |

Balances move + interest burns **inside the single `Close` updateId** — malform any leg and the
whole `Close` aborts (nested `exercise` failure rolls back the transaction). That is the clincher.

### The `Close` command that worked

`ExerciseCommand` on `#continuum-contracts:Continuum.Deal:ContinuationDeal`, choice `Close`,
`actAs:[gp]`. gp is a stakeholder of every referenced contract (deal/basis signatory, allocation
admin, ExecDelegation + AcceptedParticipation + OldFundInterest co-signatory, valuation/fairness/
consent/PSA observer or signatory) ⇒ **no `disclosedContracts` needed on the `Close` itself**.
Tuples serialize as `{"_1":…,"_2":…}`:

```json
{
  "basisCid": "<IssuanceBasis cid>",
  "legExecs": [
    { "_1": "<ExecDelegation(gp,buyer) cid>", "_2": "<RegistryAllocation gp→buyer UNIT cid>" },
    { "_1": "<ExecDelegation(gp,lp) cid>",    "_2": "<RegistryAllocation gp→lp USDC cid>" }
  ],
  "burns": [ { "_1": "<AcceptedParticipation(gp,lp) cid>", "_2": "<OldFundInterest(gp,lp) cid>" } ],
  "fairnessHash": "continuum-fairness-v1"
}
```

### On-ledger conservation guard

`Close` enforces `sum(unit-leg amounts) == basis.psaPrice`. Minimal deal: `clearingPct 0.96 ×
refNav 5,000,000 = psaPrice 4,800,000`, and the single unit leg delivers exactly `4,800,000` — so
units are deal-price-backed (§5.4). `IssuanceBasis.ValidateIssuance` also gates the antecedent DAG
(valuation range/freshness, fairness range, auction-cert clearing, LPAC granted, PSA price).

### GOTCHAS learned building the `Close` (add to the list above)

- **Daml `Int` → JSON string.** `maxAsOfDays: 120` (number) → `500 LEDGER_API_INTERNAL_ERROR
  "Expected ujson.Str (data: 120)"`. Send `"120"`. (`Decimal`/`Text`/`Date`/`Time` are already strings.)
- **`Decimal` reads back normalized to 10 dp** — ACS returns `amount:"4800000.0000000000"`, not
  `"4800000.0"`. Compare `Number(a)===Number(b)`, never string-equal a decimal when matching contracts.
- **Stage choices are consuming** — `SetClearing`/`RecordConsent`/`OpenElections` each archive the deal
  and return a *new* cid. `submit-and-wait` returns only `updateId`, so re-query the ACS for the
  successor (filter by a unique `cv`) after every stage transition.
- **Recovering created cids without a tx-tree read:** snapshot the template's ACS cids before the
  submit, diff after, then narrow with a field predicate — robust against stale devnet contracts
  (prior runs leave duplicate factories/valuations/etc.).
- **Party model:** `vehicle == gp` (collapsed in `party-registry.json`), so the deal is single-sig.
  `ValuationReport.agent` and `FairnessOpinion.provider` **must ≠ gp** (Daml `ensure`) — the demo
  plays both with the `lpac` party.
