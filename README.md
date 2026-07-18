<p align="center">
  <img src="docs/assets/banner.png" alt="Continuum — a secure closing room for GP-led continuation deals, built on Canton" width="100%" />
</p>

# Continuum

**A secure closing room for GP-led continuation deals — built on [Canton](https://www.canton.network/).**
LPs and buyers commit privately, the system computes the close, and cash plus fund interests settle in one atomic transaction — with a scoped view for the LPAC and auditors.

### 🔗 Links

| | |
|---|---|
| **Live app** (Canton 5N devnet) | **https://continuum-custody.fly.dev/** |
| **Pitch deck** | **https://continuum-pitch.pages.dev/** |

---

## The problem in one breath

A PE fund is ending, but one company is still worth holding. The manager (GP) moves it into a new *continuation vehicle*. Existing investors (LPs) choose: **take cash now** or **roll into the new fund**; a secondary **buyer** provides fresh capital. The catch — the GP is on **both sides**: seller of the old fund *and* manager of the new one. That's a conflict of interest.

Continuum wires five independent parties in as **checks on that conflict** — an independent valuer prices the asset, a sealed auction discovers the real price, the LPAC signs a fairness attestation and waives the conflict, and the LPs elect privately — then settles the whole close atomically on-ledger.

## Why Canton

The same deal needs four things at once, and Canton does all four natively:

- **Per-party privacy** — LPs and buyers never see each other's elections or pricing. On a transparent chain the sealed auction is impossible.
- **Atomic multilateral settlement** — cash out, units in, rolled units, old interest burned: all legs in one transaction or none.
- **Selective disclosure** — the LPAC / auditor / regulator gets a scoped, need-to-know verification window, not the whole book.
- **No central operator** — each party signs with its own key; there's no shared database the conflicted party controls.

## Smart contracts (Daml)

Contracts live in [`continuum-daml/contracts/daml/Continuum/`](continuum-daml/contracts/daml/Continuum) (package `continuum-contracts` 1.1.0, Daml SDK 3.4.11). The deal moves through a staged lifecycle, and a single `Close` choice settles everything atomically.

| Module | Templates | Role |
|---|---|---|
| `Deal.daml` | `ContinuationDeal`, `FairnessDisclosure`, `SettlementReceipt` | The deal state machine — stages `Consented → Electing → Closed`; choices `RecordConsent`, `SetClearing`, `OpenElections`, **`Close`**, `Break`. |
| `Valuation.daml` | `ValuationReport`, `FairnessOpinion` | Independent valuer (Kroll) anchors the NAV with a real signature; fairness opinion. |
| `Consent.daml` | `LPACConsentRequest`, `LPACConsent` | LPAC governance — grants the conflict waiver the `Close` consumes. |
| `Auction.daml` | `SealedBid`, `BidFiled`, `AuctionCertificate` | Buyers bid blind; `BidFiled` is a contentless marker so the GP/LPAC see *that* a bid exists, not its amount. |
| `Election.daml` | `LPElection`, `ElectionFiled` | LPs elect sell / roll / status-quo privately; contentless marker for aggregates. |
| `Clearing.daml` | allocation logic | Lead filled to capacity, syndicate pro-rata on the overflow; `Close` asserts the deal is not undersubscribed. |
| `Issuance.daml` | `PurchaseAgreement`, `IssuanceBasis` | The antecedent-DAG gate; `ValidateIssuance` proves valuation + fairness + consent + auction cert are all present. |
| `Settlement.daml` | `TransferLegRequest` | Pre-authorised settlement legs. |
| `Registry.daml` | `RegistryHolding`, `RegistryAllocationFactory`, `RegistryAllocation` | Instrument registry — mints and reserves holdings for CV units and cash. |
| `Credential.daml` | `EligibilityCredential` | Reusable, revocable eligibility (e.g. Qualified Purchaser) — a returning buyer reuses it across deals. |
| `Document.daml` | `SignedDocument`, `hashOf` | On-ledger sha256 anchoring; every document hash goes through `hashOf` so recomputation matches. |

**The atomic close.** The GP exercises `Close` in **one transaction** that: (1) gates on the antecedent DAG (`ValidateIssuance`); (2) enforces on-ledger that *units issued == the purchase-agreement price* (conservation is a contract guarantee, not caller-trust); (3) executes every pre-signed transfer leg via co-signed `ExecDelegation`; (4) burns each LP's co-signed `OldFundInterest`; (5) emits a `FairnessDisclosure` (aggregates + fairness hash only) to the LPAC and a `SettlementReceipt` to the room. **Any nested failure aborts the whole close** — all-or-nothing.

Multi-party authorization is done with **propose-accept** (Canton 3.5 interactive submission is single-signer), so every co-signature is a real, synchronizer-verified signature by that party's own key — not a machine-to-machine `actAs`.

Tests: [`continuum-daml/tests/daml/Test/`](continuum-daml/tests/daml/Test) — atomicity, privacy/projection, conservation, clearing, auction privacy, and per-stage coverage.

## Architecture

- **Custody backend** ([`app/custody/`](app/custody), Hono + Node) — six logical custodian tenants, each holding one party's Ed25519 key and signing on its behalf. Enforces *sign-only-your-own-party* on-ledger via propose-accept, keeps an audit log, and proxies party-scoped reads. **The browser holds no key material.**
- **Frontend** ([`app/web/`](app/web), React 19 + Vite + TS) — role-scoped UI: the GP gets the full lifecycle Deal Page; narrow seats get focused single-purpose screens. Live transaction toasts + a Ledger Inspector drawer (Canton has no public explorer for private contracts — this *is* the proof).
- **Ledger** — direct JSON Ledger API v2 against the 5North (5N) Canton devnet validator; no Java backend.

Six seats, each its own custodian: **GP / Fireblocks** (orchestrator) · **Valuer / Kroll** (independent valuation) · **LPAC / State Street** (governance) · **Buyer / Copper** (sealed bid) · **Exiting LP / Northgate** (elect SELL) · **Rolling LP / BNY** (elect ROLL).

## Repo layout

```
app/               custody backend + web frontend (the deployed app)
  custody/         Hono backend — tenants, per-party signing, audit, proxy
  web/             React role-scoped UI
  ledger-client/   typed JSON Ledger API client + wallet signing
  scripts/         close-wallets.ts — headless full close on devnet
continuum-daml/    Daml contracts + tests + scripts
portal/            earlier object-centric deal workspace
prototype/         earlier static prototype
docs/              specs, plans, deploy recipes, live-proof logs
```

## Running

```bash
# Daml contracts + tests
cd continuum-daml/contracts && daml build
cd ../.. && daml test

# App (needs a 5N devnet token in app/.env — never commit it)
cd app/custody && npm install && npm run dev
```

Secrets (the shared M2M secret, custody keys, party registry) are **gitignored** and injected via env / `fly secrets` — none live in this repo.

---

Built for the Encode **Build on Canton** hackathon. Stack: Canton · Daml · Ed25519 custody · Hono · React.
