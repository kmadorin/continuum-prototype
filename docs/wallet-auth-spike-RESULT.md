# Real per-role wallet auth — PROVEN on devnet ✅

**Date:** 2026-07-10 · **Validator:** 5N devnet · Canton 3.5 JSON Ledger API v2
**Result:** a `SealedBid` (signatory = buyer) is on-ledger, **authorized by an external party's own
Ed25519 key** — not by the shared M2M act-as. This proves genuine non-custodial per-role wallet auth
works on our validator **for our custom choices** (not just Splice/Utility DARs — the loop-sdk limit
does NOT apply to the interactive-submission API). Corrects the earlier wrong assumption that real
wallets weren't feasible in the timeframe.

## Why this matters (the judge-credibility unlock)
- Each role = an **external party** holding its own keypair. It signs its OWN transactions.
- The participant/operator **cannot forge** a party's authorization — authority comes from the signature.
- Canton 3.5 interactive submission is **single-party-submissions-only** (verified in the OpenAPI), so
  multi-party authority is built the canonical Daml way: separate single-signer txs accumulate state
  (propose-accept), then a single-signer `Close` consumes it. No multisig. No custody.

## Proven recipe (all steps single-party, own key)

### Onboard an external party (the "wallet")
1. `crypto.generateKeyPairSync('ed25519')`; public key → DER SPKI base64.
2. `POST /v2/parties/external/generate-topology`
   `{synchronizer, partyHint, publicKey:{format:"CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO", keyData:<b64 DER>, keySpec:"SIGNING_KEY_SPEC_EC_CURVE25519"}}`
   → `{partyId, publicKeyFingerprint, multiHash, topologyTransactions[]}`.
3. Sign `multiHash` (base64-decode → **pure Ed25519**, no prehash) with the private key.
4. `POST /v2/parties/external/allocate`
   `{synchronizer, onboardingTransactions: topologyTransactions.map(t=>({transaction:t})), multiHashSignatures:[SIG], waitForAllocation:true, userId:"6"}`
   → party allocated (needs ParticipantAdmin, which we have).

### Submit a custom choice signed by that party
5. `POST /v2/interactive-submission/prepare`
   `{commandId, actAs:[party], synchronizerId, packageIdSelectionPreference:[], verboseHashing:true, commands:[{CreateCommand:{templateId:"#continuum-contracts:Continuum.Auction:SealedBid", createArguments:{...}}}]}`
   → `{preparedTransaction, preparedTransactionHash, hashingSchemeVersion:"HASHING_SCHEME_VERSION_V2"}`.
   (Pass `disclosedContracts` here for choices referencing contracts the party isn't a stakeholder of.)
6. Sign `preparedTransactionHash` (base64-decode → pure Ed25519) with the party key.
7. `POST /v2/interactive-submission/execute`
   `{preparedTransaction, partySignatures:{signatures:[{party, signatures:[SIG]}]}, submissionId, hashingSchemeVersion:<echo from prepare>, deduplicationPeriod:{Empty:{}}}`
   → `{}` (HTTP 200; **fire-and-forget** — poll ACS for the result, or use `executeAndWaitForTransaction`).

### SIG object (both multiHash and tx signing)
`{format:"SIGNATURE_FORMAT_CONCAT", signature:<b64 raw 64-byte ed25519 sig>, signedBy:<publicKeyFingerprint from step 2>, signingAlgorithmSpec:"SIGNING_ALGORITHM_SPEC_ED25519"}`

## Gotchas hit + resolved
- `prepare` requires `packageIdSelectionPreference` (use `[]`).
- `execute` requires `deduplicationPeriod` (use `{Empty:{}}`).
- `execute` is async → returns `{}`; the contract appears in ACS ~1s later (or use `executeAndWait…`).
- `signedBy` MUST be the `publicKeyFingerprint` Canton returned, not a self-computed one.
- Sign the exact hash bytes (base64-decode) with pure Ed25519 — node `crypto.sign(null, bytes, key)`.
- `hashingSchemeVersion` in execute must echo what `prepare` returned (V2 on 3.5).
- A plain `SealedBid` create needs NO `disclosedContracts` (gp/dealId are plain fields, not contract refs).

Reference spike: `scratchpad/wallet-spike.mjs`. Endpoints all live on
`https://ledger-api.validator.devnet.sandbox.fivenorth.io`.

## ✅ FULL WALLET CLOSE PROVEN — 26 txs, every one a single-party wallet signature (2026-07-10)

`app/scripts/close-wallets.ts` ran the entire continuation-fund close on live devnet with **4 real
external-party wallets** (gp, buyer, lpExiting, lpac), each holding its own Ed25519 key. Every one of
26 transactions was signed by the correct party's OWN key (no act-as):
- gp: factory, deal, SetClearing, OpenElections, AuctionCertificate, PSA, IssuanceBasis, mint+allocate 2 legs, the ExecDelegationProposals/OldFundInterestOffer, Accept participation, and the final **Close**.
- buyer: its own `SealedBid`; `EDP_Accept` (authorizing gp to execute its leg).
- lpExiting: its own `LPElection`; `EDP_Accept`; `OFI_Accept`; `DealParticipation`.
- lpac: `RecordConsent` (now lpac-controlled), `ValuationReport`, `FairnessOpinion`, `LPACConsent`.

Multi-party authority built via **propose-accept** (single-signer each): `ExecDelegationProposal→EDP_Accept`,
`OldFundInterestOffer→OFI_Accept`, `DealParticipation→Accept`. The gp-only `Close` consumed it. Result
(one atomic tx): Close updateId `12201d7c7422…`; `SettlementReceipt` created; buyer **+4,800,000 CV units**;
lpExiting **+4,608,000 USDC**; lpExiting `OldFundInterest` **BURNED** — all in one updateId.

Two client hardenings this required:
- **`executeAndWaitForTransaction`** instead of fire-and-forget `execute` — blocks until committed, returns
  the real updateId, and surfaces async Daml/sequencer rejections (a plain `execute` hides them).
- **Backpressure retry**: the shared devnet sequencer caps ~26 tx/60s per validator across ~113 validators;
  `WalletClient.post` retries `SEQUENCER_OVERLOADED`/409 (category 2) with backoff.

Reference: `app/scripts/close-wallets.ts`. Keys go to gitignored `app/wallet-keys.json`; party IDs to
public `app/party-registry.json`.

## Architecture consequence (see the new app spec)
Real wallets → the close is ~16 single-signer txs across 5 wallets (gp, buyer, lpExiting, lpRolling, lpac).
Daml delta needed (~30 lines, one redeploy): `ExecDelegationProposal` + `OldFundInterestOffer`
propose-accept wrappers + recontrol `RecordConsent` to `lpac` — so every co-signed contract is built by
single-party signatures instead of the M2M multi-actAs shortcut. The gp-only `Close` itself is unchanged.
