# Continuum — Real-Wallet Role Portal Spec (external parties + per-role login)

**Date:** 2026-07-10 · **Status:** Approved (wallet-auth spike GREEN, flow Fable-designed) → ready for plan
**Supersedes** the soft-session direction in `2026-07-10-continuum-app-spec.md` (auth model changed).
**Grounds:** `docs/wallet-auth-spike-RESULT.md` (proven external-party recipe),
`docs/contract-ui-role-map.md` (contract↔UI↔role), `2026-07-09-continuum-onchain-spec.md` (contracts).
**Deadline:** Mon 13 Jul 2026 12:59 BST.

---

## 1. Goal

Each role logs in with its OWN wallet (external party + Ed25519 key), sees only its own UI, and signs
its own transactions. The demo opens **one window per role**; the multi-party close is a sequence of
**single-signer** transactions, and every window flips to SETTLED at the **same ledger update — proof of
one atomic close**. Design system = the hosted portal (`portal/shared`, continuum-portal.pages.dev).

**Trust model (stated honestly in the app footer + deck):** authorization to the ledger is real and
non-custodial — each party signs with a key the operator never holds (proven: external-party interactive
submission). The reverse-proxy only *relays* signed submissions + injects the operator's transport JWT
(standard for a shared devnet validator). Registry-admin-authored holdings + the executor pattern are a
deliberate Daml design (receiver-signature-free delivery), owned in the pitch, not hidden.

---

## 2. Auth architecture — external parties, not act-as

```
5 windows (gp · buyer · lpExiting · lpRolling · lpac)
   each holds its own Ed25519 key (BIP-39 mnemonic = "connect wallet"); key never leaves the tab
   sessionStorage {role, party, mnemonic-derived key}  → per-tab isolation, free
      │  prepare (unsigned)         │  sign locally        │  execute (signed)
      ▼                             ▼                      ▼
Reverse proxy (holds ONLY the operator transport JWT; injects Bearer; forwards /v2/*)
   - relays prepare/execute; CANNOT forge a party signature
      ▼
5N validator JSON Ledger API v2  ──  deployed Daml (+ this spec's delta)
```

**Onboarding (once per role, `docs/wallet-auth-spike-RESULT.md`):** generate Ed25519 key →
`POST /v2/parties/external/generate-topology` → sign `multiHash` → `POST /v2/parties/external/allocate`.
Emits the role→party map (extends `party-registry.json`).

**Every ledger write (single-party):** `prepare {actAs:[party], commands, disclosedContracts?, packageIdSelectionPreference:[]}`
→ sign `preparedTransactionHash` (pure Ed25519) → `execute {preparedTransaction, partySignatures, hashingSchemeVersion, deduplicationPeriod:{Empty:{}}}`.

**Reads** stay as `POST /v2/state/active-contracts` scoped to the session party (real projection privacy).

**Money-shot sync:** each window streams/polls its own party's ACS (or `/v2/updates`); on the Close
landing, each renders SETTLED with the **shared `updateId`/offset** displayed. Same id in all 5 windows =
on-screen proof of one atomic tx. Close fired from the GP window.

---

## 3. Daml delta (required — rebuild + redeploy)

Every co-signed contract currently forged via the M2M multi-`actAs` shortcut must become single-party-
signable via propose-accept. Additive except one controller change. **Bump package version** (vetting
rejects same-name/same-version with a different hash), rebuild, re-upload via `POST /v2/dars`.

```daml
-- Registry.daml (or a new module) — buyer/LP authorizes gp to execute its leg, with ITS OWN signature.
template ExecDelegationProposal
  with admin : Party; party : Party
  where
    signatory admin                 -- gp proposes
    observer party
    choice EDP_Accept : ContractId ExecDelegation
      controller party              -- buyer/lp accepts = its wallet signs
      do create ExecDelegation with admin; party

-- Participation.daml — LP acknowledges its burnable stake with its own signature.
template OldFundInterestOffer
  with oldFund : Party; lp : Party; nav : Decimal
  where
    signatory oldFund               -- gp(oldFund) proposes
    observer lp
    choice OFI_Accept : ContractId OldFundInterest
      controller lp                 -- lp accepts = its wallet signs
      do create OldFundInterest with oldFund; lp; nav
```

`Deal.daml` — recontrol consent to the LPAC so it signs its own approval:
`RecordConsent` → `controller lpac` (add `lpac` as observer). `Close` is unchanged.
`AcceptedParticipation` needs no change (`DealParticipation.Accept` is already propose-accept).

---

## 4. The close as ~16 single-signer transactions (Fable-designed)

Every line = one `prepare/sign/execute` by exactly one wallet.

| # | Wallet | Tx |
|---|---|---|
| 0 | each | onboard external party (generate-topology → sign → allocate) |
| 1 | gp | create `ContinuationDeal` (vehicle=gp → single-signer) |
| 2 | gp | `SetClearing{p}` |
| 3 | buyer | create `SealedBid` (+ `BidFiled`) — peer/GP-blind |
| 4 | lpExiting | create `LPElection{sell}` (+ `ElectionFiled`) |
| 5 | lpRolling | create `LPElection{roll}` (+ `ElectionFiled`) |
| 6 | lpRolling | create `DealParticipation` (propose) |
| 7 | lpac | `Grant` on `LPACConsentRequest` (real recusal check) |
| 8 | gp | `RecordConsent` (now lpac-gated) |
| 9 | gp | create `ExecDelegationProposal{party=buyer}` |
| 10 | buyer | `EDP_Accept` → `ExecDelegation(gp,buyer)` — **buyer authorizes gp** |
| 11 | gp→lpExiting | `ExecDelegationProposal` + `EDP_Accept` (2 tx) |
| 12 | gp→lpRolling | `ExecDelegationProposal` + `EDP_Accept` (2 tx) |
| 13 | gp→lpExiting | `OldFundInterestOffer` + `OFI_Accept` (2 tx) |
| 14 | gp | `Accept` on lpRolling's `DealParticipation` → `AcceptedParticipation` |
| 15 | gp | allocate 2 legs via `AllocationFactory_Allocate` (factory disclosed) |
| 16 | gp | **`Close{basisCid,legExecs,burns,fairnessHash}`** — actAs:[gp] alone, consumes all pre-signed authority |

Backstage antecedent docs (`ValuationReport`/`FairnessOpinion`/`PSA`/`IssuanceBasis`) stay gp-signed
(declared limitation; independent valuation named as production work). `disclosedContracts` needed on the
allocate legs + `Close` (factory/allocation/execDelegation/basis blobs), harvested per the proven recipe.

---

## 5. Frontend

- **Design:** copy `portal/shared/styles.css` (47KB, same tokens as prototype/), Archivo + IBM Plex Mono
  fonts, portal chrome (topbar, sign-in), the 9-stage progress meter + section sub-nav. Reuse portal's
  named participants + copy.
- **Per-role login:** sign-in screen → pick role → derive/restore the role's key from a mnemonic →
  `sessionStorage` locks the tab to that party. No in-tab "Viewing as" switcher.
- **Views** (only the role's own sections/actions, per `contract-ui-role-map.md`): Advisor/GP, Buyer,
  Exiting LP, Rolling LP, LPAC. Each drives §4 via the wallet-signing client.
- **Money-shot:** a SETTLED full-screen state per window on Close, showing the shared `updateId`.
- **Trust-model panel** in the footer (§1).
- Keep the working `HttpLedgerClient` (reads + proxy); ADD a `WalletClient` (onboard + prepare/sign/execute).

## 6. Reuse from prior streams
Keep: reverse-proxy, `HttpLedgerClient`, `party-registry.json`, `close-minimal.ts` (becomes the reference
for the 16-tx orchestration), CF Worker hosting. Rework: the React views (portal design + role-gated).
Add: `WalletClient` (external-party + interactive submission), per-role login, mnemonic key mgmt.

## 7. Risks
- **R1 — Ed25519 signing in the browser.** Mitigate: prove the proven Node recipe ports to WebCrypto/`@noble/ed25519` (same bytes) in the de-risk task; keys in-memory/sessionStorage only.
- **R2 — disclosedContracts on prepare for multi-contract legs/Close.** Mitigate: the allocate+Close already harvest blobs in `close-minimal.ts`; reuse.
- **R3 — DAR redeploy vetting** (version bump). Mitigate: bump package version, `POST /v2/dars/validate` first.
- **R4 — 16-tx orchestration timing across 5 wallets.** Mitigate: script the full sequence headless first (extend `close-minimal.ts` to real external signers) before UI.
- **R5 — WS/poll money-shot through the proxy.** Mitigate: 1s ACS polling fallback (visually identical).
