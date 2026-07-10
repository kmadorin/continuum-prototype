# Continuum — Contract ↔ UI ↔ Role map (authoritative, grounded in deployed Daml)

**Date:** 2026-07-10 · Source of truth: `continuum-daml/contracts/daml/Continuum/*.daml` (deployed on 5N devnet)
+ the proven flows in `app/scripts/{seed,close-minimal}.ts` and `app/web/src/lib/ops.ts`.
Purpose: lock what each ROLE's UI may do, mapped 1:1 to a real deployed template/choice, BEFORE the redesign.
No UI action exists that isn't a real on-ledger command here.

## Party model (who is a distinct login)

Distinct parties the demo needs as **separate role logins**: `gp` (Advisor/Organizer), `buyer`,
`lpExiting`, `lpRolling`, `lpac`. The seed already allocates `gp/buyer/lp/lpac` on devnet
(namespaced `::1220a14c…acf8`); add `lpRolling` + (optionally) a distinct `valuationAgent`/`fairnessProvider`.
**Open decision (needs owner):** the current `close-minimal.ts` collapses `vehicle=oldFund=valuationAgent=fairnessProvider=lpac` onto `gp` for the backstage antecedent docs. For a credible per-role demo, at minimum `lpac` must be a DISTINCT party (it signs `LPACConsent` and its recusal gate is the governance story). Valuation/fairness can stay gp-signed (declared limitation) or use a distinct agent — decide in the spec.

---

## Deployed templates + choices (the whole surface)

| Template | Signatory | Observers | Choices (controller) |
|---|---|---|---|
| `ContinuationDeal` {gp,vehicle,oldFund,lpac,regulator,room,fund,cv,asset,refNav,electionDeadline,clearingPrice,gpCommitment,carryCrystallized,stage} | gp,vehicle | room, regulator | `Break`(gp), `RecordConsent`(gp), `SetClearing{p}`(gp), `OpenElections`(gp), `Close{basisCid,legExecs,burns,fairnessHash}`(gp) |
| `SealedBid` {gp,buyer,dealId,pctOfNav,capacity} | **buyer only** | — | `Withdraw`(buyer). `ensure buyer /= gp` |
| `BidFiled` {gp,lpac,buyer,dealId} | buyer | gp, lpac | (marker: GP+LPAC see THAT a bid exists) |
| `AuctionCertificate` {gp,lpac,dealId,clearingPct,leadBuyer,bidTabulationHash} | gp | lpac | — |
| `LPElection` {lp,dealId,positionNav,rollNav,sellNav,disclosureHash} | **lp only** | — | `Amend{newRoll,newSell}`(lp). `ensure rollNav+sellNav==positionNav` |
| `ElectionFiled` {lp,gp,dealId} | lp | gp | (marker) |
| `LPACConsentRequest` {gp,lpac,dealId,memberRoster,recusals} | gp | lpac | `Grant{bidMarkerCids}`(lpac) → on-ledger recusal check → `LPACConsent` |
| `LPACConsent` {gp,lpac,dealId,recusals,granted} | lpac | gp | — |
| `ValuationReport` {agent,gp,dealId,navLow,navHigh,asOfDate,contentHash} | agent (≠gp) | gp (disclosed) | — |
| `FairnessOpinion` {provider,gp,lpac,dealId,fairLow,fairHigh,opinionDate,contentHash} | provider | — | — |
| `PurchaseAgreement` {oldFund,vehicle,dealId,price,refNav,clearingPct,asOfDate} | oldFund,vehicle | — | — |
| `IssuanceBasis` {gp,…refs} | gp | — | the antecedent gate `Close` validates |
| `RegistryHolding` {admin,owner,instId,amount,locked,meta_} | admin | owner | (mock-USDC / CV units / asset) |
| `RegistryAllocationFactory` {admin} | admin | — | `AllocationFactory_Allocate` / `_PublicFetch` (interface) |
| `SettlementReceipt` {gp,…,dealId,totalUnits,clearingPct} | gp | room | post-close proof |
| `FairnessDisclosure` | gp | regulator/room | scoped oversight window |

---

## Per-role UI (only real commands; `actAs` = the logged-in role's party)

### 🟦 Advisor / Organizer (`gp`) — runs the deal
| UI action | Command | Stage gate |
|---|---|---|
| Open closing room | create `ContinuationDeal` (`createDeal`) | → `Bidding` |
| (backstage) publish valuation / fairness / PSA / IssuanceBasis | create `ValuationReport`,`FairnessOpinion`,`PurchaseAgreement`,`IssuanceBasis` | before Close |
| Select lead & set price | `SetClearing{p}` (+ create `AuctionCertificate`) | any pre-terminal |
| Record LPAC consent | `RecordConsent` | after LPAC granted → `Consented` |
| Open elections | `OpenElections` | needs `Consented` + clearing set → `Electing` |
| **Close — all at once** | `Close{basisCid,legExecs,burns,fairnessHash}` (multi-actAs gp+buyer+lp, disclosedContracts) | → `Closed` |
| reads | deal stage, room contracts, allocation, receipts | |

### 🟩 Secondary Buyer (`buyer`) — bids, buys units
| UI action | Command |
|---|---|
| Submit sealed bid | create `SealedBid{gp,buyer,dealId,pctOfNav,capacity}` (peer+GP-blind) + create `BidFiled` marker |
| Withdraw bid | `Withdraw` on own `SealedBid` |
| reads | own `SealedBid`, deal overview, own units `RegistryHolding` post-close |

### 🟨 Investor — Exiting LP (`lpExiting`) / Rolling LP (`lpRolling`)
| UI action | Command |
|---|---|
| Elect (sell / roll / split) | create `LPElection{lp,dealId,positionNav,rollNav,sellNav,disclosureHash}` (peer-blind). Exiting: `sellNav=positionNav,rollNav=0`. Rolling: `rollNav=positionNav,sellNav=0`. + create `ElectionFiled` marker |
| Amend election | `Amend{newRoll,newSell}` on own `LPElection` |
| reads | own election, deal overview, own post-close holding (units if rolled / USDC if sold) |

### 🟧 Oversight — LPAC (`lpac`) — verifies fairness
| UI action | Command |
|---|---|
| Grant conflict waiver | `Grant{bidMarkerCids}` on `LPACConsentRequest` — **on-ledger recusal check** vs `BidFiled` markers |
| reads | `BidFiled` markers (observer), `AuctionCertificate` (observer), `LPACConsent`, `SettlementReceipt`, `FairnessDisclosure` |

---

## Privacy per role (real Canton projection — the money shot)
- Buyer A cannot see Buyer B's `SealedBid` (no observers). GP can't see bid contents until `SelectLead` discloses.
- No LP sees another LP's `LPElection` (no observers). GP sees only `ElectionFiled` markers, not amounts, until `Close`.
- LPAC sees `BidFiled` markers (THAT a bid exists) for the recusal gate, never bid contents.
- Each role tab querying its own party's ACS shows a genuinely different contract set — that's the demo, not a sim.
