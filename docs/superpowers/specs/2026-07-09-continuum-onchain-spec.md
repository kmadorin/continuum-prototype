# Continuum — On-Chain Spec: Daml Contracts, Document Anchoring, Tests & Local E2E

**Date:** 2026-07-09 · **Status:** Approved design → ready for implementation planning
**Supersedes:** `docs/specs/2026-07-08-continuum-daml-contract-spec.md` and `docs/superpowers/specs/2026-07-08-continuum-daml-contracts-design.md` (folded in and re-grounded here).
**Referenced appendix:** `docs/specs/2026-07-08-continuation-fund-test-matrix.md` (72 ILPA business-rule assertions).
**Grounding:** Canton/Daml docs at `cf-docs` (cited inline); continuation-fund economics + document chain validated by a Fable domain advisor; ILPA *Continuation Funds* (May 2023).

---

## 1. Goal & scope

Deliver a **working set of Daml smart contracts + an ILPA-grounded test suite + a local-blockchain end-to-end run** that executes a full GP-led continuation-fund secondary deal (deal #1) and the deal-#2 flywheel, and that **anchors the signed valuation/fairness/auction/consent documents the token issuance rests on** to the ledger by cryptographic hash.

It must prove four Canton-essential properties: **projection privacy**, **atomic multilateral settlement**, **selective disclosure**, **multi-party workflow across separately-controlled roles** — plus a fifth that this rewrite adds: **tamper-evident provenance** — units are provably issued on a specific, independently-signed valuation and a specific discovered price, in the correct order.

**In scope (this phase):** all contracts + 3 CIP-56 instrument registries; the document/valuation anchoring layer; Daml Script tests; local e2e on a **canton sandbox**.
**Out of scope (later):** devnet deploy (validator/VPN/Keycloak), portal-UI ↔ JSON Ledger API wiring, full Splice LocalNet runtime + wallet, real USDCx/Circle, multi-participant topology, GP carry-in-waterfall economics.

---

## 2. Decisions

| # | Decision | Rationale / grounding |
|---|---|---|
| 1 | **Real Canton Network Token Standard** (CIP-0056 / `splice-api-token-*` interfaces); our own registries implement them. | Authentic DvP + wallet-path; local tests need no Splice runtime. |
| 2 | **Sealed bids on-ledger**, buyer sole signatory → peer-blind; the bid contract *is* the pre-reveal commitment. | Canton projection privacy; kills phantom-bid claims. |
| 3 | **Rolling LPs roll at the deal price** (clearing %), not par. | ILPA canonical; keeps every unit backed by $1.00 of contribution. |
| 4 | **Units = PSA price / $1.00**, where `PSA price = clearing × reconciled NAV`. **Not** `valuation NAV / $1`. | The signed valuation is a *condition-precedent antecedent*, never the arithmetic input (Fable §3). |
| 5 | **Independent valuation is a first-class, signed, hash-anchored contract**; issuance is gated on an `IssuanceBasis` that links valuation + fairness + auction certificate + LPAC consent + PSA. | Anchoring the *whole antecedent DAG* is faithful; anchoring valuation alone over-claims (Fable §4). |
| 6 | **Document hashes on-ledger via `DA.Crypto.Text.sha256`**; confidential docs shared by **explicit disclosure** (not observer); attestation by **signatory**; linkage recorded on `Holding.meta`. | `DA.Crypto.Text` (stable, 3.4.9); `explicit-contract-disclosure.mdx`; language-reference signatory guarantee; `MetadataV1`. |
| 7 | **Default-to-sell needs no post-deadline LP signature:** each LP pre-authorizes the executor at deal-join via a **co-signed `DealParticipation`**; `OldFundInterest` is **LP+GP co-signed** and burned *through* that delegation; instrument holdings are **registry-admin-authored** so delivery needs no live receiver signature. | ILPA never-forced-to-roll + default-sell must not strand non-electors. |
| 8 | **Independent parties are distinct:** `ValuationAgent`, `FairnessProvider`, `LPAC`, `Regulator` are separate parties from `GP`. LPAC ≠ Regulator. | Governance credibility; makes selective disclosure legible. |
| 9 | **On-ledger recusal & conflict checks:** the LPAC gate derives conflicts by matching the LPAC roster against `BidFiled` markers and rejects a consent whose recusals don't cover a detectable conflict; the valuation gate rejects a valuation whose signatory is the GP. | Recusal must be verified fact, not a self-reported field (Fable). |
| 10 | **Broken-deal path on-ledger:** `ContinuationDeal` has a `Break` choice → `Broken` terminal stage; voids bids/elections, leaves the old fund intact, no re-entry. | Tests 1.9 / 6.4. |
| 11 | **GP economics are declared, not hidden:** `ContinuationDeal` carries explicit `gpCommitment` + `carryCrystallized` fields (**$0 in demo numbers**, but named); real carry-in-waterfall deferred to R2's 6-leg flow. | Pre-empts the defining CV-conflict question. |
| 12 | **Staleness guard & consent binding:** valuation/fairness/close dates are pinned; a max as-of-to-close gap is enforced; each `LPElection` records the `DisclosureDocument` hash it consented against. | Staleness is the #1 real dispute vector (Fable §6). |

---

## 3. Domain grounding — the process and its document chain

**Lifecycle (ILPA-faithful ordering):** GP rationale → advisor solicits **sealed bids** → lead selected, **clearing price** set → **independent valuation** + **fairness opinion** on file → **LPAC conflict-waiver** (≥10 business days) → **LP elections** at the set price (roll / status-quo / sell / split; **default = sell**; ≥20 business / 30 calendar days) → **allocation** (pro-rata *buyers only*; rolls filled 100%; syndicate fills overflow at lead price) → **atomic close** (cash ⇄ units ⇄ asset; old interests burned) → **scoped post-close disclosure** → flywheel.

**The signed-document chain the close depends on** (Fable §2), each modeled on-ledger as a hash-anchored, signatory-attested contract:

| Order | Document | Signed by | Attests | Issuance depends? |
|---|---|---|---|---|
| 1 | GP NAV mark | GP valuation committee | reference NAV $52.0M as-of a date | reference denominator only |
| 2 | **Independent valuation** | `ValuationAgent` | Atlas fair value / range, as-of date | **antecedent (range check)** |
| 3 | **Auction certificate** | `GP`/Advisor | 96% clearing + sealed-bid tabulation hash | **price discovery** |
| 4 | **Fairness opinion** | `FairnessProvider` | consideration (96%×NAV) is fair | **antecedent (condition precedent)** |
| 5 | **LPAC conflict-waiver** | `LPAC` | conflict reviewed & waived, recusals | **hard legal condition** |
| 6 | **Disclosure document** | `GP` | conflicts/valuation/fairness/terms package | elections bind to its hash |
| 7 | **Election forms** | each `LP` | roll/sell instruction at deal price | roller units bind 1:1 |
| 8 | **Purchase & Sale Agreement (PSA)** | old-fund + `Vehicle` | price $49.92M = 96%×$52.0M | **the number units derive from** |
| 9 | subscriptions / CV LPA | buyers / GP | unit commitments, CV terms | unit issuance 1:1 |

**Issuance chain (Decision 4):** GP mark sets the denominator → independent valuation validates it (range) → auction discovers the multiplier (96%) → fairness opinion blesses the product → PSA fixes $49.92M → elections/subscriptions allocate it → **units issued at $1.00 = PSA price**.

---

## 4. Architecture

### 4.1 Topology & parties

Single Canton participant hosting all parties (hackathon topology — proves per-party **projection** privacy; operator-level separation is R2). Daml authority is **party-level, not key-level**, so co-locating hats behind one key does not weaken the per-party proofs.

| Party | Role |
|---|---|
| `GP` | deal author; auction runner; settlement **executor**; registry admin hat; old-fund + `Vehicle` hats (MVP) |
| `ValuationAgent` | signs the independent `ValuationReport` (must differ from GP) |
| `FairnessProvider` | signs the `FairnessOpinion` (independent; may differ from ValuationAgent) |
| `RollingLP` / `ExitingLP` (×N) | file elections; receive units / cash |
| `Buyer` (×M) | lead + syndicate; sealed bids; pay USDC; receive units |
| `LPAC` | grants the conflict waiver (recusal-aware) |
| `Regulator` | scoped post-close fairness view only |
| `Issuer` | signs reusable `EligibilityCredential` |
| `CashRegistry` / `Vehicle` | CIP-56 instrument admins (cash / CV units); may share GP key in MVP |

### 4.2 Instruments (our registries implement the real interfaces)

Three CIP-56 instruments, each admin-authored `Holding` UTXOs with `InstrumentId {admin, id}`, implementing `TransferFactory` + `AllocationFactory` + `Allocation` + our `AllocationRequest` (`splice-api-token-*`):

| Instrument | InstrumentId | Admin | Divisible | Notes |
|---|---|---|---|---|
| Mock USDC | `{CashRegistry,"USDC"}` | CashRegistry | yes | drop-in → Circle USDCx later |
| CV units | `{Vehicle,"MERIDIAN-CV-I"}` | Vehicle | yes | `meta.class ∈ {StatusQuo, NewTerms, Buyer}`; `meta` carries valuation hash |
| Atlas asset | `{GP,"PROJECT-ATLAS"}` | old-fund | no | `amount = 1`; economics in `meta` (`refNAV`,`price`) |

Holdings are **registry-admin-authored** → delivery to a party (incl. a non-electing exiting LP) needs no live receiver signature (Decision 7). `OldFundInterest` is a plain position (never traded), **LP+GP co-signed**, burned at close via `DealParticipation`.

### 4.3 Document & valuation anchoring layer

A reusable signed-document primitive plus typed valuation/fairness contracts. All anchor a `contentHash : BytesHex` (`DA.Crypto.Text.sha256` of the off-ledger PDF) and are **confidential**, shared into a transaction by **explicit disclosure** (the `PriceQuotation_Fetch` pattern from `explicit-contract-disclosure.mdx`), never by adding observers.

- **`SignedDocument`** — generic anchor. `signatory attestor`; fields `dealId, docType, contentHash, docUri, asOfDate, signedAt`, optional `attestorSig : SignatureHex` + `attestorKey : PublicKeyHex`. `nonconsuming Fetch` returns its view for in-choice assertion. Its existence-with-signatory *is* the attestation; the contract-id is a tamper-evident hash (forged disclosed blobs → `DISCLOSED_CONTRACT_AUTHENTICATION_FAILED`). Optional in-body `secp256k1WithValidation attestorSig contentHash attestorKey` for an embedded detached signature.
- **`ValuationReport`** — `signatory ValuationAgent`; `navLow, navHigh` (or point), `asOfDate`, `contentHash`. Gate rejects `signatory == GP`.
- **`FairnessOpinion`** — `signatory FairnessProvider`; `fairLow, fairHigh` (% of NAV), `opinionDate`, `contentHash`.
- **`AuctionCertificate`** — `signatory GP`/Advisor; `clearingPct`, `bidTabulationHash` (hash over the revealed sealed bids), `certDate`.
- **`DisclosureDocument`** — `signatory GP`; `contentHash`, `version`. Each `LPElection` stores the `contentHash` it was filed against.
- **`PurchaseAgreement` (PSA)** — `signatory old-fund + Vehicle`; `price`, `refNav`, `clearingPct`, `asOfDate`. The price units derive from.
- **`IssuanceBasis`** — `signatory GP`; references (by cid + hash) the ValuationReport set + FairnessOpinion + AuctionCertificate + LPACConsent + PSA, plus a `reconciliation : InRangeOfAll | LowerOf | Midpoint` and `maxAsOfGap`. **`Close` is gated on a valid `IssuanceBasis`**; it asserts: reconciliation satisfied across all `ValuationReport`s; `clearing ∈ [fairLow, fairHigh]`; `AuctionCertificate.clearingPct == clearing`; `LPACConsent.granted`; `PSA.price == clearing × reconciledNav`; and every date within `maxAsOfGap` of close. Units issued `= PSA.price / navPerUnit`. The minted `Holding.meta` records `("continuum/valuation-sha256", contentHash)` and `("continuum/psa-sha256", …)` under DNS-prefixed keys (`MetadataV1`).

**Multi-estimator:** N `ValuationReport`s from distinct agents; `reconciliation` is a *predicate* (deal price within all ranges), not an average. Default point-pick when required: `LowerOf`.

**Where the document bytes live (off-ledger).** Canton is **not** a document store — only the `sha256` hash (+ `docUri`, optional signature) goes on-ledger; the actual (encrypted) PDF lives off-ledger, keyed by that hash. Storage backends are interchangeable because the contracts only hold the hash:

- **S3-compatible object storage** — simplest; e.g. **[fil.one](https://www.fil.one/)** as the S3-compatible (Filecoin-backed) bucket, or any S3/data-room. Store the encrypted document; put its `s3://…`/`https://…` URL in `docUri`; the on-ledger `sha256` makes it tamper-evident.
- **Encrypted IPFS/Filecoin** (CID as `docUri`) — adds decentralized, self-verifying retrieval; optional flourish, no extra trust property beyond the on-ledger hash.

If the stored object is ciphertext, keep **both** hashes: the plaintext `sha256` on-ledger (integrity/attestation proof) and the storage object's own address in `docUri` (retrieval); distribute decryption keys off-band. Swapping backends (local data room → fil.one → IPFS) changes only what `docUri` points at, never the contracts.

### 4.4 Contract set

| Template | Signatory | Observers | Key choices (controller) |
|---|---|---|---|
| `ContinuationDeal` | GP (+Vehicle) | room; Regulator post-close | `SubmitBid`(Buyer, nonconsuming), `SelectLead`(GP), `OpenElections`(GP), `Close`(GP), `Break`(GP)→`Broken`; carries `gpCommitment`/`carryCrystallized` |
| `DealParticipation` | LP/Buyer + GP | — | propose-accept; the LP+GP authority `Close` exercises to burn the LP's `OldFundInterest` + settle its leg (Decision 7) |
| `EligibilityCredential` | Issuer | Buyer | `Revoke`(Issuer); reused (flywheel); `Close` asserts unrevoked per funding buyer |
| `SealedBid` | Buyer | — | `Withdraw`(Buyer); disclosed to GP at `SelectLead`; commitment for `AuctionCertificate` |
| `BidFiled` | Buyer | GP | contentless marker; the fact the recusal gate checks |
| `ValuationReport` | ValuationAgent | GP (disclosed) | `Fetch`; gate rejects signatory==GP |
| `FairnessOpinion` | FairnessProvider | GP (disclosed) | `Fetch` |
| `AuctionCertificate` | GP | room (disclosed) | `Fetch` |
| `DisclosureDocument` | GP | room | `Fetch`; elections bind to its hash |
| `LPACConsentRequest`/`LPACConsent` | GP / LPAC | LPAC / GP | `Grant`(LPAC); on-ledger recusal check; gates `OpenElections` |
| `LPElection` | LP (sole) | — | `Amend`(LP); stores consented disclosure-hash; disclosed to GP at `Close`; default absent = SELL |
| `ElectionFiled` | LP | GP | contentless marker |
| `OldFundInterest` | old-fund (GP) + LP | — | co-signed; burned in `Close` via `DealParticipation` |
| `PurchaseAgreement` | old-fund + Vehicle | LPAC (disclosed) | the PSA price |
| `IssuanceBasis` | GP | — | the antecedent gate `Close` validates |
| `TransferLegRequest` *(impl `AllocationRequest`)* | GP (executor) | leg sender+receiver | senders `AllocationFactory_Allocate`; executor `Allocation_ExecuteTransfer` |
| `SettlementReceipt` / `FairnessDisclosure` | GP | room / Regulator | post-close proof / scoped regulator window |

### 4.5 Atomic close & issuance

`Close` (controller GP as executor), one atomic transaction: (1) fetch the disclosed `IssuanceBasis` + antecedents, assert all §4.3 gates and the §5 conservation invariants; (2) read disclosed `LPElection`s at `clearing`, compute roll/sell aggregates, syndicate fill, **buyer-only** pro-rata scaling, apply the rounding rule; (3) create per-leg `TransferLegRequest`s; senders allocate; (4) `Allocation_ExecuteTransfer` across all legs **+** burn every `OldFundInterest` via its `DealParticipation` — all-or-nothing; (5) mint carries valuation/PSA hashes in `Holding.meta`; emit `SettlementReceipt` (room) + `FairnessDisclosure` (Regulator).

**Canonical numbers (clearing 96%, NAV $52M, roll $31.6M, sell $20.4M):** PSA price $49.92M · buyer cash $19.584M · roller units 30,336,000 · buyer units 19,584,000 · total units 49,920,000 · asset at cost $49.92M · NAV/unit $1.00.

**Pinned behaviors:** split election `ensure rollNav+sellNav == positionNav`; buyer decline-to-fund → re-scale syndicate, else `Break`; revoked credential at funding → `Close` fails; rounding: CV units floor-to-whole, residual units → lead buyer; cash to the cent, residual → largest exiting LP.

### 4.6 Privacy & disclosure model

| Fact | Synchronizer | GP | Other LPs | Buyer | LPAC | Regulator |
|---|---|---|---|---|---|---|
| Reference price / fairness range | ✗ | ✓ | ✓ | ✓ | ✓ | post-close |
| A buyer's sealed bid | ✗ | at `SelectLead` (disclosed) | ✗ | own | ✗ | post-close (scoped) |
| An LP's election | ✗ | at `Close` (disclosed) | ✗ | ✗ | ✗ | post-close (scoped) |
| Valuation report (confidential) | ✗ | disclosed | ✗ | ✗ | disclosed | scoped |
| Computed allocation / legs | ✗ | ✓ | own leg | own leg | ✗ | scoped |

Sealed contents (`SealedBid`, `LPElection`) have **no observers** → invisible to peers and to GP until explicitly disclosed at clearing/close. Confidential documents are shared by **explicit disclosure** (`created_event_blob`), keeping contents private while letting a choice validate them. Regulator/LPAC become observers only of the scoped result contracts they're meant to see.

---

## 5. Economics & conservation invariants (assert in `Close`)

With clearing `P=0.96`, NAV `N=$52.0M`, roll `R=$31.6M`, sell `S=$20.4M`:

1. Partition: `R + S == N` (31.6 + 20.4 = 52.0).
2. Issuance basis: `PSA.price == P × reconciledNav == $49.92M`, and `reconciledNav` satisfies the reconciliation predicate over the `ValuationReport` set (here $52M ∈ each range).
3. Cash conservation: buyer cash in `== P × S == $19.584M ==` exiting-LP cash out; none retained by GP/CV.
4. Units backed: `unitsIssued == PSA.price / navPerUnit == 49,920,000`; roller `R×P=30,336,000` + buyer `S×P=19,584,000` == total.
5. Roll-at-deal-price: each roller's CV fraction `== R/N` (30.336/49.92 = 31.6/52 = 60.77%).
6. Value conservation: exiting haircut `S−P·S = 0.816M` == buyer day-one discount; rollers value-neutral.
7. Rolls filled 100%; only buyers scaled.
8. Old fund terminal: asset holding transferred out (assert existence/owner, not `amount`); all `OldFundInterest`s (rollers' too) burned.
9. Provenance: minted `Holding.meta` carries the `IssuanceBasis` valuation + PSA hashes.

---

## 6. Test strategy

Daml Script, one suite per group. **Guaranteed must-pass this phase:** the 10 ⚠️ business rules + all of groups 5 (conservation) and 6 (atomicity) from the appendix matrix, each with positive **and** negative tests; plus the new group 9 below. Non-flagged group-8 edges are stretch.

Groups 1–8: as enumerated in `docs/specs/2026-07-08-continuation-fund-test-matrix.md` (sequencing/gating, elections, price/fairness, allocation/oversubscription, conservation, atomicity, privacy, edge). Priority: default=SELL · rollers get 96¢ units · burn rollers' old interests · syndicate pays lead price · never scale rolls · LPAC+price before elections · GP blind mid-window · all-roll no divide-by-zero · LPAC-bidder recusal · non-elector needs no signature.

**Group 9 — document & valuation anchoring (new):**
- 9.1 Independent valuation required: `Close` fails if no `ValuationReport`, or if its signatory == GP.
- 9.2 `IssuanceBasis` completeness: missing any antecedent (valuation / fairness / auction cert / LPAC / PSA) → `Close` fails (5 negatives).
- 9.3 Fairness range: `clearing ∉ [fairLow,fairHigh]` → `Close` fails.
- 9.4 Multi-estimator reconciliation: two `ValuationReport`s; price outside either range → fails; inside both → passes; `LowerOf` point-pick honored.
- 9.5 Staleness: as-of-to-close gap > `maxAsOfGap` → `Close` fails.
- 9.6 Election-to-disclosure binding: an election filed against an outdated `DisclosureDocument` hash is rejected/flagged; close uses the consented hash.
- 9.7 Hash integrity: recompute `sha256` in-choice equals stored `contentHash`; a tampered disclosed blob is rejected by contract authentication.
- 9.8 Provenance on units: minted `Holding.meta` contains the valuation + PSA hashes.
- 9.9 Attestation privacy: `ValuationReport` disclosed to GP/close without making other parties observers (query as a Buyer/other-LP → not visible).

---

## 7. Local e2e

`e2e/run.sh`: `dpm build` → boot **canton sandbox** → upload DAR → run `Seed` then `Close` as Daml Script against the live ledger → query final ACS and assert §5 conservation + group-9 provenance hold on a real ledger. Party IDs read from `Seed` output, never hardcoded.

`Seed` (re-runnable Daml Script): allocate parties → register 3 instruments → mint USDC to buyers + unit treasury to `Vehicle` → issue `EligibilityCredential`s → publish `ValuationReport`/`FairnessOpinion`/`DisclosureDocument` with real `sha256` of sample PDFs → create `ContinuationDeal`.

---

## 8. Build order (blocker-first)

1. **Spike A — token plumbing (blocker #1):** one allocate→execute leg with the `Usdc` registry on the sandbox.
2. **Spike B — privacy plumbing:** GP-blind-mid-window (test 7.3) via explicit disclosure of a `SealedBid`/`LPElection` to GP only at clearing/close. De-risk before scaling.
3. **Spike C — document anchoring:** a `ValuationReport` with `sha256(PDF)`, shared by explicit disclosure, fetched + asserted in a choice; confirm `DISCLOSED_CONTRACT_AUTHENTICATION_FAILED` on a tampered blob.
4. All 3 registries + `Seed` (incl. document publication).
5. `ContinuationDeal` + `EligibilityCredential` + `DealParticipation`; `SubmitBid` → `SelectLead` → `AuctionCertificate`.
6. `ValuationReport`/`FairnessOpinion`/`DisclosureDocument`/`PurchaseAgreement`/`IssuanceBasis`.
7. `LPElection` (+ default-to-sell, disclosure-hash binding) + `LPACConsent` gate (on-ledger recusal) + `Break`/`Broken`.
8. `Close`: gate on `IssuanceBasis` + clearing math + rounding + 4-leg `Allocation` batch + `OldFundInterest` burns + invariant asserts + `meta` provenance.
9. `SettlementReceipt` + `FairnessDisclosure`; deal-#2 flywheel.
10. Full e2e on sandbox; test matrix (groups 1–9) green via `dpm test`.

---

## 9. Risks

- **R1 — `splice-api-token-*` interface DARs as build deps.** Spike A; fallback = vendor the interface sources.
- **R2 — `AllocationRequest`/`Allocation` against real interface signatures** (ExtraArgs/ChoiceContext shapes). Crib cn-quickstart's `AllocationRequest` example.
- **R3 — explicit-disclosure plumbing** for confidential valuation + sealed bids (Spikes B/C). If it slips, fallback = GP-as-observer (weaker privacy) — flagged, not silent.
- **R4 — time-gated tests** (LPAC ≥10 biz days, election window, staleness gap) need Script `setTime`/`passTime`; keep durations configurable.
- **R5 — `DA.Crypto.Text` availability** on the pinned SDK (stable since 3.4.9 — verify against the chosen version at Spike C).

---

## 10. Q&A pre-emptions (for the demo)

1. *"One key is GP + executor + registry + Vehicle + old-fund — and you claim privacy?"* → party-level authority; live mid-window per-party ACS query (test 7.3) is the money shot; multi-participant is R2.
2. *"Where is GP carry/commitment?"* → declared `gpCommitment`/`carryCrystallized` fields (Decision 11); carry-in-waterfall named as R2's 6-leg flow.
3. *"You burned a non-responding LP's interest and cashed them out without a close signature — on what basis?"* → LP-co-signed `OldFundInterest` + pre-authorized `DealParticipation` + ILPA default-to-sell + ≥20-day window.
4. *"The GP set the NAV and issued tokens on it."* → units derive from the **PSA price**, gated on an **independent, signatory-attested, hash-anchored `ValuationReport` + fairness opinion + auction certificate + LPAC consent**, all anchored *before* issuance (order provable). Honest limit: anchoring proves **provenance and ordering**, not that the valuation is *correct*.
