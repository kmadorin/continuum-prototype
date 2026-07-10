# Convergence run — UI wired to devnet, conservation verified ✅

**Date:** 2026-07-10 · **Validator:** shared 5N Seaport devnet · **Stream C Tasks 1–2**

The React UI now drives the **real** Daml contracts on devnet through the reverse-proxy
(no mock). Proven end-to-end in a browser plus a headless atomic-Close conservation check.

## 1. UI wiring (Task 1) — live in-browser

- `app/web/src/App.tsx` injects `HttpLedgerClient('/api')` (was `MockLedgerClient`); Vite dev-proxy
  `/api → http://localhost:8788` (reverse-proxy → devnet JSON Ledger API v2).
- Personas read from the seed-emitted `party-registry.json` (real `::1220a14c…acf8` party IDs).
- Browser-verified views (all reading/writing real devnet contracts):
  - **Advisor** — created deal, stage `Electing`, clearing `96% of NAV`, refNav `$52M`.
  - **Investor — Leaving** — real `LPElection` filed (Sell), peer-blind.
  - **Privacy proof** — per-party `activeContracts()` columns show *different* contract sets
    (Gp / Buyer / Buyer2), the live cross-party projection — the money shot.
  - **Oversight — LPAC** — reads the on-ledger `SettlementReceipt` + `FairnessDisclosure`.
- Bug caught by the browser run (headless was green, UI was dead): a bare `fetch` default in
  `HttpLedgerClient` lost its `this` binding → `Illegal invocation` in-browser. Fixed →
  `globalThis.fetch.bind(globalThis)` (`app/ledger-client/src/client.ts`).

## 2. Atomic Close — conservation on-ledger (Task 2)

`app/scripts/close-minimal.ts`, single atomic `Deal.Close` transaction:

| Fact | Value |
|---|---|
| **Close updateId** | `12209f23040de09450cf7fbb7a96926a62611bdb109131cbdb5e8e38ced205565b24` (single tx) |
| **SettlementReceipt** | `0013863f8919a54b8c31db3d6702ccaaa038962a39bede0ebf5f956837208cbbfeca…` — `totalUnits=4800000.0`, `clearingPct=0.96` |
| buyer CV units (`MERIDIAN-CV-I`) | +4,800,000 (== PSA price == unit total) |
| lp USDC | +4,608,000 (== 0.96 × 4.8M) |
| lp `OldFundInterest` | **BURNED** |

Conservation (on-chain spec §5): unit total `4,800,000` == PSA price `4,800,000`; cash
`4,608,000` == clearing `0.96` × PSA `4,800,000`. Balances move + interest burns **inside the
single Close updateId** — malform any leg and the whole transaction rolls back.

## 3. Known demo-hygiene note (deferred by owner — "ship as-is, polish later")

Shared devnet has accumulated contracts from many test runs, so the UI's `readDeal`→`latest()`
picks an arbitrary real deal (not necessarily the one clicked this session) and the Privacy-proof
columns are noisy. Floor bars are met (real contracts, privacy visibly differs). Cleanest polish
before the hosted demo/video = seed fresh session-nonce parties so each party's ACS holds only the
current run.
