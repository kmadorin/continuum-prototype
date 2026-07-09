# Continuum On-Chain (Daml) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Continuum continuation-fund Daml contracts + ILPA-grounded Daml Script tests + a local canton-sandbox end-to-end run, executing deal #1 and the deal-#2 flywheel and anchoring the signed valuation/document chain by hash.

**Architecture:** One `contracts` package (templates + a single generic Token-Standard registry implementing the real `splice-api-token-*` interfaces) and one `tests` package (Daml Script suites, one per business-rule group). Instruments (cash / CV units / portfolio asset) are all the same generic `Holding`/`AllocationFactory`/`Allocation` implementation distinguished only by `InstrumentId`. Settlement is one atomic `Allocation_ExecuteTransfer` batch inside the `Close` choice, gated on an `IssuanceBasis` that links the independent valuation, fairness opinion, auction certificate, LPAC consent and PSA (each hash-anchored via `DA.Crypto.Text.sha256`). Units derive from the PSA price, never the valuation NAV.

**Tech Stack:** Daml SDK 3.4.x via DPM; `splice-api-token-*-v1` interfaces (from the splice-node release bundle) as `data-dependencies`; `daml-script`; `DA.Crypto.Text`; local `dpm sandbox` (`--static-time`).

**Spec:** `docs/superpowers/specs/2026-07-09-continuum-onchain-spec.md`. **Test matrix:** `docs/specs/2026-07-08-continuation-fund-test-matrix.md`.

**Canonical numbers (assert everywhere):** clearing `P=0.96`, NAV `$52.0M`, roll `$31.6M`, sell `$20.4M` → PSA price `$49.92M`, buyer cash `$19.584M`, roller units `30,336,000`, buyer units `19,584,000`, total units `49,920,000`, NAV/unit `$1.00`. Amounts are in whole dollars in code (e.g. `52000000.0`) to avoid millions-vs-dollars ambiguity.

---

## Conventions

- Project root: `continuum-daml/` (new, at repo top level next to `portal/`).
- **Three packages:** `contracts/` (templates only — NO daml-script, this is the DAR we upload), `scripts/` (Seed + Scenario, depends on contracts + daml-script), `tests/` (Daml Script test suites), tied by `continuum-daml/multi-package.yaml`.
- Module prefix `Continuum.` for our code; tests are `Test.<Group>`.
- Commit after every task with the message shown. Run `dpm build --all` (from `continuum-daml/`) before every `dpm test`.
- **TDD everywhere:** write the failing Script test, run it, see it fail, implement, run it, see it pass, commit.

### Party model (MVP topology — decided from Fable plan review A1/A3)

The GP's own internal hats are **one party** to keep authority tractable on a single participant: **`gp` also acts as `vehicle`, `oldFund`, and the single registry `admin`** (cash/units/asset instruments). This matches spec §4.1 ("may share the GP key in MVP"). Parties that MUST stay distinct (independence / authority separation): `ValuationAgent`, `FairnessProvider` (`ensure agent /= gp`), `LPAC`, `Regulator`, `Issuer`, each `RollingLP`/`ExitingLP`, each `Buyer`. Consequence: any contract co-signed by `gp`+`vehicle` (e.g. `ContinuationDeal`) or `oldFund`+`lp` (e.g. `OldFundInterest`) has `gp` on one side, so seeding it needs `submitMulti [lp, gp] []` (co-signed creation needs both authorities) — never a bare `submit gp`.

### Reader-choice convention for confidential contracts (Fable A5)

Explicit disclosure grants **visibility, not authority**. A party reading a disclosed contract in a submission must be the **controller** of the choice it exercises. So every confidential contract (`SealedBid`, `LPElection`, `SignedDocument`, `ValuationReport`, …) exposes a reader-parameterised fetch choice:

```haskell
nonconsuming choice Read : &lt;View&gt;
  with reader : Party
  controller reader
  do pure (&lt;projected view of this&gt;)
```

The holder calls `queryDisclosure holder cid` and passes the `Disclosure` via `submit (actAs reader <> disclose d)`; the reader exercises `Read`. This is how `SelectLead` reads sealed bids and how `Close` reads sealed elections/valuations.

### Two-phase settlement (Fable A3 — the load-bearing correction)

`AllocationFactory_Allocate`'s controller is the leg **sender**; a GP-controlled `Close` choice has no buyer authority and cannot allocate buyer legs. Therefore settlement is two-phase: **(phase 1, per sender, own submission, pre-close)** each sender exercises `AllocationFactory_Allocate` against its `TransferLegRequest`, producing an admin-signed `RegistryAllocation` (this IS the sender's pre-authorization; `Allocation_Withdraw` is its escape hatch). **(phase 2, `Close`, one GP transaction)** GP exercises `Allocation_ExecuteTransfer` on every allocation (controller includes `settlement.executor = gp`), burns interests, mints units. Atomicity holds exactly at settlement.

---

## Phase 0 — Scaffold, dependencies, version pinning

### Task 0.1: Create the two-package workspace

**Files:**
- Create: `continuum-daml/multi-package.yaml`
- Create: `continuum-daml/contracts/daml.yaml`
- Create: `continuum-daml/scripts/daml.yaml`
- Create: `continuum-daml/tests/daml.yaml`
- Create: `continuum-daml/contracts/daml/Continuum/Types.daml`
- Create: `continuum-daml/.gitignore`

- [ ] **Step 1: Write `multi-package.yaml`**

```yaml
# continuum-daml/multi-package.yaml
packages:
  - ./contracts
  - ./scripts
  - ./tests
```

- [ ] **Step 2: Write `contracts/daml.yaml`** (versions get pinned in Task 0.3; DAR paths are placeholders now, filled in 0.3)

```yaml
sdk-version: 3.4.11
name: continuum-contracts
source: daml
version: 1.0.0
dependencies:
  - daml-prim
  - daml-stdlib
data-dependencies:
  - ../dars/splice-api-token-metadata-v1.dar
  - ../dars/splice-api-token-holding-v1.dar
  - ../dars/splice-api-token-transfer-instruction-v1.dar
  - ../dars/splice-api-token-allocation-v1.dar
  - ../dars/splice-api-token-allocation-instruction-v1.dar
  - ../dars/splice-api-token-allocation-request-v1.dar
build-options:
  - --target=2.1
```

- [ ] **Step 3a: Write `scripts/daml.yaml`** (Seed + Scenario live here — they need daml-script and must NOT be in the uploaded contracts DAR)

```yaml
sdk-version: 3.4.11
name: continuum-scripts
source: daml
version: 1.0.0
dependencies:
  - daml-prim
  - daml-stdlib
  - daml-script
data-dependencies:
  - ../contracts/.daml/dist/continuum-contracts-1.0.0.dar
  - ../dars/splice-api-token-metadata-v1.dar
  - ../dars/splice-api-token-holding-v1.dar
  - ../dars/splice-api-token-transfer-instruction-v1.dar
  - ../dars/splice-api-token-allocation-v1.dar
  - ../dars/splice-api-token-allocation-instruction-v1.dar
  - ../dars/splice-api-token-allocation-request-v1.dar
build-options:
  - --target=2.1
```

- [ ] **Step 3b: Write `tests/daml.yaml`** (all six splice DARs — tests import AllocationInstructionV1 etc.)

```yaml
sdk-version: 3.4.11
name: continuum-tests
source: daml
version: 1.0.0
dependencies:
  - daml-prim
  - daml-stdlib
  - daml-script
data-dependencies:
  - ../contracts/.daml/dist/continuum-contracts-1.0.0.dar
  - ../scripts/.daml/dist/continuum-scripts-1.0.0.dar
  - ../dars/splice-api-token-metadata-v1.dar
  - ../dars/splice-api-token-holding-v1.dar
  - ../dars/splice-api-token-transfer-instruction-v1.dar
  - ../dars/splice-api-token-allocation-v1.dar
  - ../dars/splice-api-token-allocation-instruction-v1.dar
  - ../dars/splice-api-token-allocation-request-v1.dar
build-options:
  - --target=2.1
```

- [ ] **Step 4: Write `.gitignore`**

```gitignore
.daml/
dars/*.dar
```

- [ ] **Step 5: Write a minimal `Types.daml` so the package compiles**

```haskell
module Continuum.Types where

-- Percentages are Decimals in [0,1]; NAV/amounts are whole-dollar Decimals.
navPerUnit : Decimal
navPerUnit = 1.0
```

- [ ] **Step 6: Commit**

```bash
git add continuum-daml/multi-package.yaml continuum-daml/contracts/daml.yaml continuum-daml/tests/daml.yaml continuum-daml/.gitignore continuum-daml/contracts/daml/Continuum/Types.daml
git commit -m "chore(daml): scaffold contracts+tests workspace"
```

### Task 0.2: Verify the toolchain

- [ ] **Step 1: Confirm DPM + SDK**

Run: `dpm version` and `dpm install 3.4.11`
Expected: DPM prints its version; SDK 3.4.11 present (or is downloaded).

- [ ] **Step 2: Confirm `DA.Crypto.Text` is available on this SDK** (stable since 3.4.9; we pin 3.4.11)

Add to `Types.daml` temporarily:

```haskell
import DA.Crypto.Text (sha256)
docHashProbe : Text -> Text
docHashProbe = sha256
```

Run: `cd continuum-daml && dpm build` (in `contracts/`)
Expected: builds clean. If `sha256` is not found, STOP — the SDK is too old; bump `sdk-version`. Remove the probe after confirming and rebuild.

- [ ] **Step 3: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Types.daml
git commit -m "chore(daml): confirm DA.Crypto.Text available on 3.4.11"
```

### Task 0.3: Fetch + pin the token-standard DARs

**Files:**
- Create: `continuum-daml/dars/` (six `.dar` files, git-ignored)
- Create: `continuum-daml/dars/VERSIONS.md`

- [ ] **Step 1: Download the splice-node bundle and extract the six API DARs**

Run:
```bash
mkdir -p continuum-daml/dars && cd continuum-daml/dars
curl -L -o splice-node.tar.gz https://github.com/digital-asset/decentralized-canton-sync/releases/download/v0.6.11/0.6.11_splice-node.tar.gz
tar tzf splice-node.tar.gz | grep -E 'splice-api-token-(metadata|holding|transfer-instruction|allocation|allocation-instruction|allocation-request)-v1.*\.dar'
```
Expected: the six `splice-api-token-*-v1-<ver>.dar` paths are listed.

- [ ] **Step 2: Extract and rename to the unversioned names used in `daml.yaml`**

Run (adjust the inner paths to what Step 1 printed):
```bash
tar xzf splice-node.tar.gz --strip-components=N -C . <paths from step 1>
for f in splice-api-token-metadata holding transfer-instruction allocation allocation-instruction allocation-request; do
  mv splice-api-token-${f}-v1-*.dar splice-api-token-${f}-v1.dar 2>/dev/null || true
done
ls splice-api-token-*-v1.dar
```
Expected: six files named exactly as referenced in `contracts/daml.yaml`.

- [ ] **Step 3: Record the exact versions**

Create `continuum-daml/dars/VERSIONS.md`:
```markdown
# Token Standard DARs
Bundle: 0.6.11_splice-node.tar.gz (decentralized-canton-sync v0.6.11)
Extracted: splice-api-token-{metadata,holding,transfer-instruction,allocation,allocation-instruction,allocation-request}-v1
Renamed to unversioned .dar names referenced from daml.yaml.
```

- [ ] **Step 4: Build against the real DARs**

Run: `cd continuum-daml && dpm build --all`
Expected: `continuum-contracts-1.0.0.dar` builds; the token-standard modules resolve. If a package-name/version mismatch error appears, correct the `data-dependencies` paths to the actual extracted filenames and rebuild.

- [ ] **Step 5: Commit**

```bash
git add continuum-daml/dars/VERSIONS.md continuum-daml/contracts/daml.yaml continuum-daml/tests/daml.yaml
git commit -m "chore(daml): pin splice-api-token-*-v1 DARs from 0.6.11 bundle"
```

---

## Phase 1 — De-risking spikes (prove the hard plumbing before scaling)

### Task 1.1: Spike A — full settlement dress rehearsal (the biggest risk, front-loaded)

This validates our reconstructed interface signatures AND every authority edge the atomic `Close` depends on (Fable review D): **two different senders each allocate in their own submissions (against a disclosed factory), then a third-party executor executes BOTH allocations plus a delegated burn of a co-signed contract in ONE transaction.** If this passes, Phase 7 is assembly; if it fails, we've lost hours not days. If a signature differs from the reconstruction, fix it HERE and propagate.

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Registry.daml`
- Create: `continuum-daml/tests/daml/Test/SpikeAllocation.daml`

- [ ] **Step 1: Write the generic registry** (implements `Holding`, `AllocationFactory`, `Allocation`)

```haskell
module Continuum.Registry where

import DA.List (sortOn)
import Splice.Api.Token.HoldingV1
import Splice.Api.Token.MetadataV1
import Splice.Api.Token.AllocationV1
import Splice.Api.Token.AllocationInstructionV1

-- A fungible holding for ANY instrument. signatory = admin (registry) so the
-- admin can author/deliver holdings without the owner's live signature.
template RegistryHolding
  with
    admin  : Party
    owner  : Party
    instId : Text
    amount : Decimal
    locked : Bool
    meta_  : TextMap Text
  where
    signatory admin
    observer owner
    ensure amount > 0.0

    interface instance Holding for RegistryHolding where
      view = HoldingView with
        owner
        instrumentId = InstrumentId with admin; id = instId
        amount
        lock = if locked then Some (Lock [admin] None None None) else None
        meta = Metadata with values = meta_

-- The registry factory that mints allocations by reserving holdings.
template RegistryAllocationFactory
  with
    admin : Party
  where
    signatory admin

    interface instance AllocationFactory for RegistryAllocationFactory where
      view = AllocationFactoryView with admin; meta = emptyMetadata
      allocationFactory_publicFetchImpl _self arg =
        pure (AllocationFactoryView with admin; meta = emptyMetadata)
      allocationFactory_allocateImpl _self arg = do
        let spec    = arg.allocation
            leg     = spec.transferLeg
            sender  = leg.sender
        -- fetch + archive the input holdings, VALIDATING each belongs to the
        -- sender, matches the leg instrument, and is unlocked (Fable MUST-FIX 2)
        inputs <- forA arg.inputHoldingCids \hcid -> do
          let rcid = fromInterfaceContractId @RegistryHolding hcid
          h <- fetch rcid
          assertMsg "wrong owner"      (h.owner == sender)
          assertMsg "wrong instrument" (h.instId == leg.instrumentId.id)
          assertMsg "holding locked"   (not h.locked)
          archive rcid
          pure h
        let total = sum (map (.amount) inputs)
        assertMsg "insufficient holdings for allocation" (total >= leg.amount)
        -- reserve the leg amount in a locked holding owned by the Allocation
        allocCid <- create RegistryAllocation with
          admin; spec; reserved = leg.amount
        -- return change to the sender if any
        changeCids <- if total > leg.amount
          then do
            c <- create RegistryHolding with
              admin; owner = sender; instId = leg.instrumentId.id
              amount = total - leg.amount; locked = False; meta_ = emptyTextMap
            pure [toInterfaceContractId @Holding c]
          else pure []
        pure AllocationInstructionResult with
          output = AllocationInstructionResult_Completed with allocationCid = toInterfaceContractId @Allocation allocCid
          senderChangeCids = changeCids
          meta = emptyMetadata

template RegistryAllocation
  with
    admin    : Party
    spec     : AllocationSpecification
    reserved : Decimal
  where
    signatory admin

    interface instance Allocation for RegistryAllocation where
      view = AllocationView with
        allocation = spec; holdingCids = []; meta = emptyMetadata
      allocation_executeTransferImpl _self _arg = do
        let leg = spec.transferLeg
        rc <- create RegistryHolding with
          admin; owner = leg.receiver; instId = leg.instrumentId.id
          amount = reserved; locked = False; meta_ = leg.meta.values
        pure Allocation_ExecuteTransferResult with
          senderHoldingCids = []
          receiverHoldingCids = [toInterfaceContractId @Holding rc]
          meta = emptyMetadata
      allocation_cancelImpl _self _arg = do
        rc <- create RegistryHolding with
          admin; owner = spec.transferLeg.sender; instId = spec.transferLeg.instrumentId.id
          amount = reserved; locked = False; meta_ = emptyTextMap
        pure Allocation_CancelResult with senderHoldingCids = [toInterfaceContractId @Holding rc]; meta = emptyMetadata
      allocation_withdrawImpl _self _arg = do
        rc <- create RegistryHolding with
          admin; owner = spec.transferLeg.sender; instId = spec.transferLeg.instrumentId.id
          amount = reserved; locked = False; meta_ = emptyTextMap
        pure Allocation_WithdrawResult with senderHoldingCids = [toInterfaceContractId @Holding rc]; meta = emptyMetadata

emptyTextMap : TextMap Text
emptyTextMap = mempty
```

> If the real interface requires additional methods or different names than reconstructed, `dpm build` will name the missing/incorrect method — fix each against the compiler and the `.mdx` reference, keeping the algorithm above.

- [ ] **Step 1b: Add a tiny co-signed delegation to the registry module (for the burn edge of the rehearsal)**

```haskell
-- in Continuum.Registry (throwaway; the real ones live in Continuum.Participation)
template ProbeInterest
  with admin : Party; lp : Party
  where signatory admin, lp

template ProbeDelegation
  with admin : Party; lp : Party
  where
    signatory admin, lp
    nonconsuming choice ProbeBurn : ()
      with icid : ContractId ProbeInterest
      controller admin
      do archive icid
```

- [ ] **Step 2: Write the failing dress-rehearsal test — two senders allocate, executor executes both + burns, in ONE tx**

```haskell
module Test.SpikeAllocation where

import Daml.Script
import DA.Assert ((===))
import Continuum.Registry
import Splice.Api.Token.HoldingV1
import Splice.Api.Token.AllocationV1
import Splice.Api.Token.AllocationInstructionV1
import Splice.Api.Token.MetadataV1

-- helper: build an allocation spec for one leg
legSpec : Party -> Party -> Party -> Text -> Decimal -> Time -> Text -> AllocationSpecification
legSpec executor sender receiver instId amount now legId =
  AllocationSpecification with
    settlement = SettlementInfo with
      executor; settlementRef = Reference with id = "settle-1"; cid = None
      requestedAt = now; allocateBefore = now; settleBefore = now; meta = emptyMetadata
    transferLegId = legId
    transferLeg = TransferLeg with
      sender; receiver; amount
      instrumentId = InstrumentId with admin = executor; id = instId; meta = emptyMetadata

-- sender allocates against the factory it must SEE via disclosure (Fable MUST-FIX 1)
allocateLeg : Party -> Party -> ContractId RegistryAllocationFactory -> AllocationSpecification
            -> ContractId Holding -> Time -> Script (ContractId Allocation)
allocateLeg admin sender factory spec holdingCid now = do
  Some dF <- queryDisclosure admin factory
  res <- submit (actAs sender <> disclose dF) do
    exerciseCmd (toInterfaceContractId @AllocationFactory factory)
      AllocationFactory_Allocate with
        expectedAdmin = admin; allocation = spec; requestedAt = now
        inputHoldingCids = [holdingCid]
        extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
  case res.output of
    AllocationInstructionResult_Completed cid -> pure cid
    _ -> abort "allocate did not complete"

spikeSettlementDressRehearsal : Script ()
spikeSettlementDressRehearsal = do
  gp    <- allocateParty "GP"          -- executor + registry admin + vehicle (MVP hats)
  buyer <- allocateParty "Buyer"       -- sender of the cash leg
  seller<- allocateParty "Seller"      -- receiver of cash
  roller<- allocateParty "Roller"      -- receiver of units
  lp    <- allocateParty "LP"          -- burn target
  now <- getTime
  factory <- submit gp do createCmd RegistryAllocationFactory with admin = gp
  -- mint: buyer holds cash, gp(vehicle) holds a unit treasury
  cash  <- submit gp do createCmd RegistryHolding with admin = gp; owner = buyer; instId = usdcId; amount = 19584000.0; locked = False; meta_ = emptyTextMap
  units <- submit gp do createCmd RegistryHolding with admin = gp; owner = gp;    instId = unitId; amount = 49920000.0; locked = False; meta_ = emptyTextMap
  -- co-signed interest + accepted delegation (created with BOTH authorities)
  interest <- submitMulti [gp, lp] [] do createCmd ProbeInterest with admin = gp; lp
  deleg    <- submitMulti [gp, lp] [] do createCmd ProbeDelegation with admin = gp; lp
  -- PHASE 1 — each sender allocates in its own submission
  aCash  <- allocateLeg gp buyer factory (legSpec gp buyer seller usdcId 19584000.0 now "cash") (toInterfaceContractId @Holding cash) now
  aUnits <- allocateLeg gp gp    factory (legSpec gp gp    roller unitId 30336000.0 now "units")(toInterfaceContractId @Holding units) now
  -- PHASE 2 — executor executes BOTH allocations + burns, in ONE transaction
  submit gp do
    _ <- exerciseCmd aCash  Allocation_ExecuteTransfer with extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
    _ <- exerciseCmd aUnits Allocation_ExecuteTransfer with extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
    exerciseCmd deleg ProbeBurn with icid = interest
  -- assertions: seller has cash, roller has units, interest burned, gp has unit change
  sellerHs <- query @RegistryHolding seller
  [ h.amount | (_, h) <- sellerHs ] === [19584000.0]
  rollerHs <- query @RegistryHolding roller
  [ h.amount | (_, h) <- rollerHs ] === [30336000.0]
  gone <- query @ProbeInterest lp
  gone === []
```

- [ ] **Step 3: Run — iterate signatures until it passes**

Run: `cd continuum-daml && dpm build --all && dpm test --files tests/daml/Test/SpikeAllocation.daml`
Expected: first iterations fail to compile (registry method names/records vs the real DARs) — fix each against the compiler and the api-reference `.mdx`, keeping the algorithm. Then `spikeSettlementDressRehearsal` PASSES. **This is the go/no-go gate for the whole design.**

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Registry.daml continuum-daml/tests/daml/Test/SpikeAllocation.daml
git commit -m "feat(daml): registry + multi-sender settlement dress rehearsal (authority edges proven)"
```

### Task 1.2: Spike B — GP-blind-mid-window via explicit disclosure

**Files:**
- Create: `continuum-daml/tests/daml/Test/SpikeDisclosure.daml`
- Modify: `continuum-daml/contracts/daml/Continuum/Types.daml` (add a throwaway `SealedProbe`)

- [ ] **Step 1: Add a sealed probe template**

```haskell
-- in Continuum.Types
template SealedProbe
  with
    owner : Party
    secret : Decimal
  where
    signatory owner
    -- reader is the controller (disclosure grants visibility, not authority)
    nonconsuming choice Reveal : Decimal
      with reader : Party
      controller reader
      do pure secret
```

- [ ] **Step 2: Write the test — GP cannot see the sealed value until disclosed**

```haskell
module Test.SpikeDisclosure where

import Daml.Script
import DA.Assert ((===))
import Continuum.Types

spikeDisclosure : Script ()
spikeDisclosure = do
  gp    <- allocateParty "GP"
  buyer <- allocateParty "Buyer"
  cid <- submit buyer do createCmd SealedProbe with owner = buyer; secret = 96.0
  -- GP query returns nothing: the sealed contract has no GP stakeholder
  gpView <- query @SealedProbe gp
  gpView === []
  -- Buyer discloses to GP; GP (as reader/controller) can now use it in a submission
  Some d <- queryDisclosure buyer cid
  v <- submit (actAs gp <> disclose d) do exerciseCmd cid Reveal with reader = gp
  v === 96.0
  pure ()
```

- [ ] **Step 3: Run**

Run: `dpm build --all && dpm test --files tests/daml/Test/SpikeDisclosure.daml`
Expected: PASS — `query @SealedProbe gp == []` proves GP-blindness; disclosed exercise returns 96.0.

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Types.daml continuum-daml/tests/daml/Test/SpikeDisclosure.daml
git commit -m "test(daml): prove GP-blind sealed contract + explicit disclosure"
```

### Task 1.3: Spike C — document hash anchoring

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Document.daml`
- Create: `continuum-daml/tests/daml/Test/SpikeHash.daml`

- [ ] **Step 1: Write the SignedDocument template**

```haskell
module Continuum.Document where

import DA.Crypto.Text (sha256, BytesHex)

data DocType = Valuation | Fairness | AuctionCert | Disclosure | PSA | Election
  deriving (Eq, Show)

template SignedDocument
  with
    attestor    : Party
    dealId      : Text
    docType     : DocType
    contentHash : BytesHex   -- sha256 of the off-ledger document
    docUri      : Text       -- e.g. an https://…/fil.one object URL
    asOfDate    : Date
    signedAt    : Time
  where
    signatory attestor
    -- reader is the controller so a disclosed doc can be read by GP/Close
    nonconsuming choice FetchDoc : SignedDocument
      with reader : Party
      controller reader
      do pure this

-- helper: compute the on-ledger hash of a text payload
hashOf : Text -> BytesHex
hashOf = sha256
```

- [ ] **Step 2: Write the test — hash recomputation + tamper detection**

```haskell
module Test.SpikeHash where

import Daml.Script
import DA.Assert ((===))
import DA.Date (date, Month(Jun))
import Continuum.Document
import DA.Crypto.Text (sha256)

spikeHash : Script ()
spikeHash = do
  agent <- allocateParty "ValuationAgent"
  let payload = "Project Atlas valuation report v1: NAV 52000000"
      h = sha256 payload
  cid <- submit agent do createCmd SignedDocument with
    attestor = agent; dealId = "MERIDIAN-1"; docType = Valuation
    contentHash = h; docUri = "https://bucket.fil.one/atlas-val-v1.pdf.enc"
    asOfDate = date 2026 Jun 30; signedAt = time (date 2026 Jun 30) 0 0 0
  Some doc <- queryContractId agent cid
  -- recomputing the hash of the same payload matches; a tampered payload does not
  doc.contentHash === sha256 payload
  assert (doc.contentHash /= sha256 (payload <> " TAMPERED"))
  pure ()
```

- [ ] **Step 3: Run**

Run: `dpm build --all && dpm test --files tests/daml/Test/SpikeHash.daml`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Document.daml continuum-daml/tests/daml/Test/SpikeHash.daml
git commit -m "feat(daml): SignedDocument hash anchoring + tamper-detection spike"
```

---

## Phase 2 — Instruments & seed foundation

### Task 2.1: Instrument identifiers + minting helpers

**Files:**
- Modify: `continuum-daml/contracts/daml/Continuum/Registry.daml`
- Create: `continuum-daml/tests/daml/Test/Instruments.daml`

- [ ] **Step 1: Add instrument-id constructors + a mint helper**

```haskell
-- in Continuum.Registry
usdcId, unitId, assetId : Text
usdcId  = "USDC"
unitId  = "MERIDIAN-CV-I"
assetId = "PROJECT-ATLAS"

mint : Party -> Party -> Text -> Decimal -> TextMap Text -> Update (ContractId RegistryHolding)
mint admin owner instId amount meta_ =
  create RegistryHolding with admin; owner; instId; amount; locked = False; meta_
```

- [ ] **Step 2: Write the test — mint cash, units, indivisible asset**

```haskell
module Test.Instruments where

import Daml.Script
import DA.Assert ((===))
import Continuum.Registry

instrumentsMint : Script ()
instrumentsMint = do
  gp    <- allocateParty "GP"
  buyer <- allocateParty "Buyer"
  cash <- submit gp do createCmd RegistryHolding with
    admin = gp; owner = buyer; instId = usdcId; amount = 20000000.0; locked = False; meta_ = mempty
  Some h <- queryContractId gp cash
  h.amount === 20000000.0
  pure ()
```

- [ ] **Step 3: Run**

Run: `dpm build --all && dpm test --files tests/daml/Test/Instruments.daml`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Registry.daml continuum-daml/tests/daml/Test/Instruments.daml
git commit -m "feat(daml): instrument ids + mint helper"
```

---

## Phase 3 — Deal core, eligibility, participation

### Task 3.1: EligibilityCredential (with flywheel reuse)

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Credential.daml`
- Create: `continuum-daml/tests/daml/Test/Credential.daml`

- [ ] **Step 1: Write the failing test**

```haskell
module Test.Credential where

import Daml.Script
import DA.Assert ((===))
import Continuum.Credential

credentialReusableAndRevocable : Script ()
credentialReusableAndRevocable = do
  issuer <- allocateParty "Issuer"
  buyer  <- allocateParty "Buyer"
  cred <- submit issuer do createCmd EligibilityCredential with
    issuer; holder = buyer; scheme = "QP"; valid = True
  -- reusable across deals: still valid, unconsumed
  Some c <- queryContractId buyer cred
  c.valid === True
  -- revoke
  cred2 <- submit issuer do exerciseCmd cred Revoke
  Some c2 <- queryContractId buyer cred2
  c2.valid === False
```

- [ ] **Step 2: Run — expect fail (module missing)**

Run: `dpm build --all` → FAIL: `Continuum.Credential` not found.

- [ ] **Step 3: Implement**

```haskell
module Continuum.Credential where

template EligibilityCredential
  with
    issuer : Party
    holder : Party
    scheme : Text
    valid  : Bool
  where
    signatory issuer
    observer holder
    choice Revoke : ContractId EligibilityCredential
      controller issuer
      do create this with valid = False
```

- [ ] **Step 4: Run — expect pass**

Run: `dpm build --all && dpm test --files tests/daml/Test/Credential.daml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Credential.daml continuum-daml/tests/daml/Test/Credential.daml
git commit -m "feat(daml): EligibilityCredential (reusable, revocable)"
```

### Task 3.2: ContinuationDeal skeleton + stage machine + Break

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Deal.daml`
- Create: `continuum-daml/tests/daml/Test/Deal.daml`

- [ ] **Step 1: Write the failing test (stages + broken-deal)**

```haskell
module Test.Deal where

import Daml.Script
import DA.Assert ((===))
import Continuum.Deal

dealBreakGoesToBroken : Script ()
dealBreakGoesToBroken = do
  gp <- allocateParty "GP"
  deal <- submit gp do createCmd sampleDeal with gp
  broken <- submit gp do exerciseCmd deal Break with reason = "LPAC denied"
  Some d <- queryContractId gp broken
  d.stage === Broken
```

- [ ] **Step 2: Run — expect fail**

Run: `dpm build --all` → FAIL.

- [ ] **Step 3: Implement the deal + stages**

```haskell
module Continuum.Deal where

data Stage = Setup | Bidding | LeadSelected | Consented | Electing | Closed | Broken
  deriving (Eq, Show)

template ContinuationDeal
  with
    gp               : Party
    vehicle          : Party
    oldFund          : Party
    lpac             : Party
    regulator        : Party
    room             : [Party]        -- LPs + buyers as observers
    fund             : Text
    cv               : Text
    asset            : Text
    refNav           : Decimal
    electionDeadline : Time
    clearingPrice    : Optional Decimal
    gpCommitment     : Decimal        -- declared; 0.0 in the demo
    carryCrystallized: Decimal        -- declared; 0.0 in the demo
    stage            : Stage
  where
    signatory gp, vehicle
    observer room, regulator

    choice Break : ContractId ContinuationDeal
      with reason : Text
      controller gp
      do assertMsg "already terminal" (stage /= Closed && stage /= Broken)
         create this with stage = Broken

-- a reusable sample for tests. Per the MVP party model, gp = vehicle = oldFund.
-- lpac/regulator are passed distinct. (Daml has no `undefined`; this is a function.)
mkDeal : Party -> Party -> Party -> ContinuationDeal
mkDeal gp lpac regulator = ContinuationDeal with
  gp; vehicle = gp; oldFund = gp; lpac; regulator
  room = []; fund = "Meridian Growth Fund III"; cv = "Meridian CV I"; asset = "Project Atlas"
  refNav = 52000000.0; electionDeadline = time (date 1970 Jan 1) 0 0 0
  clearingPrice = None; gpCommitment = 0.0; carryCrystallized = 0.0; stage = Setup
```

- [ ] **Step 4: Write the test using `mkDeal`, run — expect pass**

```haskell
-- Test.Deal
dealBreakGoesToBroken : Script ()
dealBreakGoesToBroken = do
  gp   <- allocateParty "GP"
  lpac <- allocateParty "LPAC"
  reg  <- allocateParty "Regulator"
  deal <- submit gp do createCmd (mkDeal gp lpac reg)   -- gp signs both gp+vehicle (same party)
  broken <- submit gp do exerciseCmd deal Break with reason = "LPAC denied"
  Some d <- queryContractId gp broken
  d.stage === Broken
```
Run: `dpm build --all && dpm test --files tests/daml/Test/Deal.daml`
Expected: PASS (`stage == Broken`).

- [ ] **Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Deal.daml continuum-daml/tests/daml/Test/Deal.daml
git commit -m "feat(daml): ContinuationDeal stage machine + Break/Broken"
```

### Task 3.3: DealParticipation + OldFundInterest (LP co-signed, burn delegation)

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Participation.daml`
- Create: `continuum-daml/tests/daml/Test/Participation.daml`

- [ ] **Step 1: Write the failing test — GP alone cannot burn; delegation can**

```haskell
module Test.Participation where

import Daml.Script
import Continuum.Participation

burnNeedsDelegation : Script ()
burnNeedsDelegation = do
  gp <- allocateParty "GP"      -- gp also plays oldFund (MVP party model)
  lp <- allocateParty "LP"
  -- co-signed interest: creation needs BOTH oldFund(=gp) and lp authority
  oi <- submitMulti [gp, lp] [] do createCmd OldFundInterest with oldFund = gp; lp; nav = 5000000.0
  -- GP cannot archive the LP-co-signed interest unilaterally (needs lp too)
  submitMustFail gp do archiveCmd oi
  -- LP proposes participation; GP accepts -> co-signed authority the Close uses
  part <- submit lp do createCmd DealParticipation with gp; lp
  part2 <- submit gp do exerciseCmd part Accept
  _ <- submit gp do exerciseCmd part2 BurnFor with interestCid = oi
  remaining <- query @OldFundInterest lp
  assert (null remaining)
```

- [ ] **Step 2: Run — expect fail**

Run: `dpm build --all` → FAIL.

- [ ] **Step 3: Implement**

```haskell
module Continuum.Participation where

template OldFundInterest
  with
    oldFund : Party
    lp      : Party
    nav     : Decimal
  where
    signatory oldFund, lp        -- co-signed: neither can burn alone

-- LP proposes; GP accepts -> co-signed authority the Close exercises.
template DealParticipation
  with
    gp : Party
    lp : Party
  where
    signatory lp
    observer gp
    choice Accept : ContractId AcceptedParticipation
      controller gp
      do create AcceptedParticipation with gp, lp

template AcceptedParticipation
  with
    gp : Party
    lp : Party
  where
    signatory gp, lp             -- both authorities available in choice bodies
    -- GP (executor) burns the LP's interest using the co-signed authority here.
    nonconsuming choice BurnFor : ()
      with interestCid : ContractId OldFundInterest
      controller gp
      do oi <- fetch interestCid
         assertMsg "wrong lp" (oi.lp == lp)
         archive interestCid
```

- [ ] **Step 4: Run — expect pass**

Run: `dpm build --all && dpm test --files tests/daml/Test/Participation.daml`
Expected: PASS — `submitMustFail gp (archiveCmd oi)` holds; `BurnFor` archives it.

- [ ] **Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Participation.daml continuum-daml/tests/daml/Test/Participation.daml
git commit -m "feat(daml): LP-cosigned OldFundInterest + DealParticipation burn delegation"
```

---

## Phase 4 — Auction (sealed bids → lead → certificate)

### Task 4.1: SealedBid + BidFiled marker (peer-blind)

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Auction.daml`
- Create: `continuum-daml/tests/daml/Test/AuctionPrivacy.daml`

- [ ] **Step 1: Write the failing privacy test (matrix 7.2)**

```haskell
module Test.AuctionPrivacy where

import Daml.Script
import DA.Assert ((===))
import Continuum.Auction

buyersBlindToEachOther : Script ()
buyersBlindToEachOther = do
  gp <- allocateParty "GP"
  b1 <- allocateParty "B1"
  b2 <- allocateParty "B2"
  _ <- submit b1 do createCmd SealedBid with gp, buyer = b1, dealId = "D1", pctOfNav = 0.96, capacity = 20000000.0
  -- B2 cannot see B1's bid; GP cannot see its contents (no observers)
  b2View <- query @SealedBid b2
  b2View === []
  gpView <- query @SealedBid gp
  gpView === []
```

- [ ] **Step 2: Run — expect fail**

Run: `dpm build --all` → FAIL.

- [ ] **Step 3: Implement**

```haskell
module Continuum.Auction where

template SealedBid
  with
    gp       : Party
    buyer    : Party
    dealId   : Text
    pctOfNav : Decimal
    capacity : Decimal
  where
    signatory buyer            -- sole signatory => peer-blind and GP-blind
    -- GP self-dealing guard (matrix 8.11): the GP cannot bid on its own deal
    ensure pctOfNav > 0.0 && pctOfNav <= 1.0 && capacity > 0.0 && buyer /= gp
    choice Withdraw : ()
      controller buyer
      do pure ()

template BidFiled            -- contentless marker: GP + LPAC see THAT a bid is in
  with
    gp     : Party
    lpac   : Party
    buyer  : Party
    dealId : Text
  where
    signatory buyer
    observer gp, lpac        -- lpac observes so the recusal gate can fetch these facts
```

- [ ] **Step 4: Run — expect pass**

Run: `dpm build --all && dpm test --files tests/daml/Test/AuctionPrivacy.daml`
Expected: PASS (both queries empty).

- [ ] **Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Auction.daml continuum-daml/tests/daml/Test/AuctionPrivacy.daml
git commit -m "feat(daml): sealed bids (peer- and GP-blind) + BidFiled marker"
```

### Task 4.2: SelectLead (disclosed bids) + AuctionCertificate

**Files:**
- Modify: `continuum-daml/contracts/daml/Continuum/Auction.daml`
- Create: `continuum-daml/tests/daml/Test/Auction.daml`

- [ ] **Step 1: Write the failing test — GP selects lead from disclosed bids, cert records clearing**

```haskell
module Test.Auction where

import Daml.Script
import DA.Assert ((===))
import DA.Crypto.Text (sha256)
import Continuum.Auction

leadSetsClearingPrice : Script ()
leadSetsClearingPrice = do
  gp <- allocateParty "GP"
  b1 <- allocateParty "B1"
  b2 <- allocateParty "B2"
  bid1 <- submit b1 do createCmd SealedBid with gp, buyer = b1, dealId = "D1", pctOfNav = 0.96, capacity = 20000000.0
  bid2 <- submit b2 do createCmd SealedBid with gp, buyer = b2, dealId = "D1", pctOfNav = 0.95, capacity = 10000000.0
  Some d1 <- queryDisclosure b1 bid1
  Some d2 <- queryDisclosure b2 bid2
  cert <- submit (actAs gp <> discloseMany [d1, d2]) do
    createCmd AuctionCertificate with
      gp; dealId = "D1"; clearingPct = 0.96; leadBuyer = b1
      bidTabulationHash = sha256 "b1:0.96;b2:0.95"
  Some c <- queryContractId gp cert
  c.clearingPct === 0.96
  c.leadBuyer === b1
```

- [ ] **Step 2: Run — expect fail**

Run: `dpm build --all` → FAIL (`AuctionCertificate` missing).

- [ ] **Step 3: Implement AuctionCertificate**

```haskell
-- in Continuum.Auction
import DA.Crypto.Text (BytesHex)

template AuctionCertificate
  with
    gp                : Party
    dealId            : Text
    clearingPct       : Decimal
    leadBuyer         : Party
    bidTabulationHash : BytesHex
  where
    signatory gp
    ensure clearingPct > 0.0 && clearingPct <= 1.0
```

- [ ] **Step 4: Run — expect pass**

Run: `dpm build --all && dpm test --files tests/daml/Test/Auction.daml`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Auction.daml continuum-daml/tests/daml/Test/Auction.daml
git commit -m "feat(daml): SelectLead via disclosed bids + AuctionCertificate"
```

---

## Phase 5 — Valuation, documents & the issuance basis

### Task 5.1: ValuationReport + FairnessOpinion (independent signatories)

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Valuation.daml`
- Create: `continuum-daml/tests/daml/Test/Valuation.daml`

- [ ] **Step 1: Write the failing test — valuation must be independent of GP; range holds**

```haskell
module Test.Valuation where

import Daml.Script
import DA.Assert ((===))
import DA.Date (date, Month(Jun))
import DA.Crypto.Text (sha256)
import Continuum.Valuation

valuationIsIndependentAndReconciles : Script ()
valuationIsIndependentAndReconciles = do
  gp    <- allocateParty "GP"
  agent <- allocateParty "ValuationAgent"
  fair  <- allocateParty "FairnessProvider"
  vr <- submit agent do createCmd ValuationReport with
    agent; gp; dealId = "D1"; navLow = 48000000.0; navHigh = 56000000.0
    asOfDate = date 2026 Jun 30; contentHash = sha256 "val"
  fo <- submit fair do createCmd FairnessOpinion with
    provider = fair; gp; dealId = "D1"; fairLow = 0.92; fairHigh = 1.0
    opinionDate = date 2026 Jun 30; contentHash = sha256 "fair"
  Some v <- queryContractId agent vr
  -- reference NAV 52M is within [48M,56M]; clearing 0.96 within [0.92,1.0]
  assert (v.navLow <= 52000000.0 && 52000000.0 <= v.navHigh)
  Some f <- queryContractId fair fo
  assert (f.fairLow <= 0.96 && 0.96 <= f.fairHigh)
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement**

```haskell
module Continuum.Valuation where

import DA.Crypto.Text (BytesHex)

template ValuationReport
  with
    agent       : Party         -- independent; MUST differ from gp
    gp          : Party
    dealId      : Text
    navLow      : Decimal
    navHigh     : Decimal
    asOfDate    : Date
    contentHash : BytesHex
  where
    signatory agent
    observer gp
    ensure navLow <= navHigh && agent /= gp

template FairnessOpinion
  with
    provider    : Party
    gp          : Party
    dealId      : Text
    fairLow     : Decimal
    fairHigh    : Decimal
    opinionDate : Date
    contentHash : BytesHex
  where
    signatory provider
    observer gp
    ensure fairLow <= fairHigh && provider /= gp
```

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Valuation.daml continuum-daml/tests/daml/Test/Valuation.daml
git commit -m "feat(daml): independent ValuationReport + FairnessOpinion (ensure agent/=gp)"
```

### Task 5.2: PurchaseAgreement + IssuanceBasis (the gate)

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Issuance.daml`
- Create: `continuum-daml/tests/daml/Test/Issuance.daml`

- [ ] **Step 1: Write the failing test — basis fetches every antecedent and checks price/range/consent/staleness**

```haskell
module Test.Issuance where

import Daml.Script
import DA.Date (date, Month(Jun), subDate)
import DA.Crypto.Text (sha256)
import Continuum.Issuance
import Continuum.Valuation
import Continuum.Auction (AuctionCertificate(..))
import Continuum.Consent (LPACConsent(..))

issuanceBasisValidates : Script ()
issuanceBasisValidates = do
  gp    <- allocateParty "GP"          -- gp = oldFund = vehicle (MVP)
  agent <- allocateParty "ValuationAgent"
  fair  <- allocateParty "FairnessProvider"
  lpac  <- allocateParty "LPAC"
  let asOf = date 2026 Jun 30; closeD = date 2026 Jun 30
  vr <- submit agent do createCmd ValuationReport with
    agent; gp; dealId = "D1"; navLow = 48000000.0; navHigh = 56000000.0; asOfDate = asOf; contentHash = sha256 "v"
  fo <- submit fair do createCmd FairnessOpinion with
    provider = fair; gp; dealId = "D1"; fairLow = 0.92; fairHigh = 1.0; opinionDate = asOf; contentHash = sha256 "f"
  ac <- submit gp do createCmd AuctionCertificate with
    gp; dealId = "D1"; clearingPct = 0.96; leadBuyer = gp; bidTabulationHash = sha256 "b"
  lc <- submit lpac do createCmd LPACConsent with gp; lpac; dealId = "D1"; recusals = []; granted = True
  psa <- submit gp do createCmd PurchaseAgreement with
    oldFund = gp; vehicle = gp; dealId = "D1"; price = 49920000.0; refNav = 52000000.0; clearingPct = 0.96; asOfDate = asOf
  let basis = IssuanceBasis with
        gp; dealId = "D1"; reconciledNav = 52000000.0; clearingPct = 0.96; psaPrice = 49920000.0
        reconciliation = InRangeOfAll; valuationCids = [vr]; fairnessCid = fo
        auctionCertCid = ac; lpacConsentCid = lc; psaCid = psa; closeDate = closeD; maxAsOfDays = 120
  cid <- submit gp do createCmd basis
  ok <- submit gp do exerciseCmd cid ValidateIssuance
  assert ok
  -- price mismatch rejected
  bad <- submit gp do createCmd basis with psaPrice = 50000000.0
  submitMustFail gp do exerciseCmd bad ValidateIssuance
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement the full gate**

```haskell
module Continuum.Issuance where

import DA.Date (subDate)
import DA.Foldable (forA_)
import Continuum.Valuation (ValuationReport(..), FairnessOpinion(..))
import Continuum.Auction (AuctionCertificate(..))
import Continuum.Consent (LPACConsent(..))

data Reconciliation = InRangeOfAll | LowerOf | Midpoint deriving (Eq, Show)

roundDollar : Decimal -> Decimal
roundDollar x = fromIntegral (round x : Int)

template PurchaseAgreement
  with
    oldFund     : Party
    vehicle     : Party
    dealId      : Text
    price       : Decimal
    refNav      : Decimal
    clearingPct : Decimal
    asOfDate    : Date
  where
    signatory oldFund, vehicle
    ensure price == roundDollar (clearingPct * refNav)

-- The antecedent DAG gate. gp is a stakeholder of every referenced contract
-- (observer of valuation/fairness/consent; signatory of cert/PSA), so it can fetch them.
template IssuanceBasis
  with
    gp             : Party
    dealId         : Text
    reconciledNav  : Decimal
    clearingPct    : Decimal
    psaPrice       : Decimal
    reconciliation : Reconciliation
    valuationCids  : [ContractId ValuationReport]
    fairnessCid    : ContractId FairnessOpinion
    auctionCertCid : ContractId AuctionCertificate
    lpacConsentCid : ContractId LPACConsent
    psaCid         : ContractId PurchaseAgreement
    closeDate      : Date
    maxAsOfDays    : Int
  where
    signatory gp
    choice ValidateIssuance : Bool
      controller gp
      do -- 1. price == clearing × reconciled NAV
         assertMsg "psaPrice != clearing × reconciledNav"
           (psaPrice == roundDollar (clearingPct * reconciledNav))
         -- 2. every independent valuation contains the reconciled NAV in range, and is fresh
         assertMsg "no valuation" (not (null valuationCids))
         forA_ valuationCids \vc -> do
           v <- fetch vc
           assertMsg "reconciledNav outside a valuation range"
             (v.navLow <= reconciledNav && reconciledNav <= v.navHigh)
           assertMsg "valuation stale" (subDate closeDate v.asOfDate <= maxAsOfDays)
         -- 3. clearing within the fairness range, fairness fresh
         f <- fetch fairnessCid
         assertMsg "clearing outside fairness range" (f.fairLow <= clearingPct && clearingPct <= f.fairHigh)
         assertMsg "fairness stale" (subDate closeDate f.opinionDate <= maxAsOfDays)
         -- 4. auction certificate agrees on clearing
         c <- fetch auctionCertCid
         assertMsg "auction cert clearing mismatch" (c.clearingPct == clearingPct)
         -- 5. LPAC granted
         l <- fetch lpacConsentCid
         assertMsg "LPAC not granted" l.granted
         -- 6. PSA price agrees
         p <- fetch psaCid
         assertMsg "PSA price mismatch" (p.price == psaPrice && p.clearingPct == clearingPct)
         pure True
```

> `subDate : Date -> Date -> Int` (DA.Date) returns the day difference. Staleness uses whole days for the demo.

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Issuance.daml continuum-daml/tests/daml/Test/Issuance.daml
git commit -m "feat(daml): PurchaseAgreement + IssuanceBasis price-gate"
```

---

## Phase 6 — Consent & elections

### Task 6.1: LPACConsent with on-ledger recusal check

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Consent.daml`
- Create: `continuum-daml/tests/daml/Test/Consent.daml`

- [ ] **Step 1: Write the failing test (matrix 8.6) — recusal coverage is derived from on-ledger `BidFiled` facts, not a GP-typed field (Decision 9)**

```haskell
module Test.Consent where

import Daml.Script
import Continuum.Consent
import Continuum.Auction (BidFiled(..))

recusalDerivedFromBidFacts : Script ()
recusalDerivedFromBidFacts = do
  lpac <- allocateParty "LPAC"
  gp   <- allocateParty "GP"
  m1   <- allocateParty "Member1"   -- LPAC member who also bid
  m2   <- allocateParty "Member2"   -- LPAC member, no bid
  -- m1 filed a bid (marker observed by gp+lpac)
  bf <- submit m1 do createCmd BidFiled with gp; lpac; buyer = m1; dealId = "D1"
  -- Grant with recusals = [] but roster includes m1 who bid -> FAILS (conflict uncovered)
  req <- submit gp do createCmd LPACConsentRequest with
    gp; lpac; dealId = "D1"; memberRoster = [m1, m2]; recusals = []
  submitMustFail lpac do exerciseCmd req Grant with bidMarkerCids = [bf]
  -- Grant recusing m1 -> succeeds
  req2 <- submit gp do createCmd LPACConsentRequest with
    gp; lpac; dealId = "D1"; memberRoster = [m1, m2]; recusals = [m1]
  _ <- submit lpac do exerciseCmd req2 Grant with bidMarkerCids = [bf]
  pure ()
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement**

```haskell
module Continuum.Consent where

import DA.List (nub)
import Continuum.Auction (BidFiled(..))

template LPACConsentRequest
  with
    gp           : Party
    lpac         : Party
    dealId       : Text
    memberRoster : [Party]   -- the LPAC membership
    recusals     : [Party]
  where
    signatory gp
    observer lpac
    -- LPAC grants only if every roster member that on-ledger DID bid is recused.
    choice Grant : ContractId LPACConsent
      with bidMarkerCids : [ContractId BidFiled]
      controller lpac
      do markers <- forA bidMarkerCids fetch
         let bidders    = nub (map (.buyer) markers)
             conflicted = filter (`elem` bidders) memberRoster
         assertMsg "recusals must cover every bidding LPAC member"
           (all (`elem` recusals) conflicted)
         create LPACConsent with gp; lpac; dealId; recusals; granted = True

template LPACConsent
  with
    gp       : Party
    lpac     : Party
    dealId   : Text
    recusals : [Party]
    granted  : Bool
  where
    signatory lpac
    observer gp
```

> Requires `BidFiled` to have `lpac` as an observer too (so LPAC can fetch the markers). Update `Continuum.Auction.BidFiled` to `observer gp, lpac` (or pass `lpac` in and disclose). Small change to Task 4.1.

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Consent.daml continuum-daml/tests/daml/Test/Consent.daml
git commit -m "feat(daml): LPAC consent with on-ledger recusal coverage check"
```

### Task 6.2: LPElection (peer-blind, disclosure-bound, split-exact) + ElectionFiled

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Election.daml`
- Create: `continuum-daml/tests/daml/Test/Election.daml`

- [ ] **Step 1: Write the failing tests — split must partition; amend before deadline; peer-blind**

```haskell
module Test.Election where

import Daml.Script
import DA.Assert ((===))
import DA.Crypto.Text (sha256)
import Continuum.Election

splitMustPartitionExactly : Script ()
splitMustPartitionExactly = do
  lp <- allocateParty "LP"
  -- position 10M: roll 6 + sell 4 OK; roll 6 + sell 5 fails
  _ <- submit lp do createCmd LPElection with
    lp; dealId = "D1"; positionNav = 10000000.0; rollNav = 6000000.0; sellNav = 4000000.0
    disclosureHash = sha256 "disc-v1"
  submitMustFail lp do createCmd LPElection with
    lp; dealId = "D1"; positionNav = 10000000.0; rollNav = 6000000.0; sellNav = 5000000.0
    disclosureHash = sha256 "disc-v1"

electionPeerBlind : Script ()
electionPeerBlind = do
  a <- allocateParty "LPA"
  b <- allocateParty "LPB"
  _ <- submit a do createCmd LPElection with
    a; dealId = "D1"; positionNav = 5000000.0; rollNav = 5000000.0; sellNav = 0.0
    disclosureHash = sha256 "disc-v1"
  bView <- query @LPElection b
  bView === []
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement**

```haskell
module Continuum.Election where

import DA.Crypto.Text (BytesHex)

template LPElection
  with
    lp             : Party
    dealId         : Text
    positionNav    : Decimal
    rollNav        : Decimal
    sellNav        : Decimal
    disclosureHash : BytesHex   -- the DisclosureDocument the LP consented against
  where
    signatory lp                 -- sole signatory => peer-blind
    ensure rollNav >= 0.0 && sellNav >= 0.0 && rollNav + sellNav == positionNav
    choice Amend : ContractId LPElection
      with newRoll : Decimal, newSell : Decimal
      controller lp
      do create this with rollNav = newRoll; sellNav = newSell

template ElectionFiled          -- contentless marker
  with
    lp     : Party
    gp     : Party
    dealId : Text
  where
    signatory lp
    observer gp
```

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Election.daml continuum-daml/tests/daml/Test/Election.daml
git commit -m "feat(daml): LPElection (peer-blind, split-exact, disclosure-bound) + marker"
```

---

## Phase 7 — Close: allocation request, atomic settlement, provenance

### Task 7.1: TransferLegRequest implements AllocationRequest

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Settlement.daml`
- Create: `continuum-daml/tests/daml/Test/Settlement.daml`

- [ ] **Step 1: Write the failing test — a leg request exposes the AllocationRequest view**

```haskell
module Test.Settlement where

import Daml.Script
import DA.Assert ((===))
import Continuum.Settlement
import Splice.Api.Token.AllocationRequestV1
import Splice.Api.Token.MetadataV1

legRequestExposesView : Script ()
legRequestExposesView = do
  gp     <- allocateParty "GP"
  sender <- allocateParty "Sender"
  recv   <- allocateParty "Recv"
  now <- getTime
  cid <- submit gp do createCmd TransferLegRequest with
    gp; sender; receiver = recv; instId = "USDC"; amount = 19584000.0
    settleBy = now; legId = "cash1"
  views <- queryInterface @AllocationRequest gp
  assert (not (null views))
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement (dispatch the two AllocationRequest methods)**

```haskell
module Continuum.Settlement where

import Splice.Api.Token.AllocationRequestV1
import Splice.Api.Token.AllocationV1
import Splice.Api.Token.HoldingV1
import Splice.Api.Token.MetadataV1
import DA.TextMap (fromList)

template TransferLegRequest
  with
    gp       : Party
    sender   : Party
    receiver : Party
    instId   : Text
    amount   : Decimal
    settleBy : Time
    legId    : Text
  where
    signatory gp
    observer sender, receiver          -- senders' wallets must see the request

    interface instance AllocationRequest for TransferLegRequest where
      view = AllocationRequestView with
        settlement = SettlementInfo with
          executor = gp; settlementRef = Reference with id = legId; cid = None
          requestedAt = settleBy; allocateBefore = settleBy; settleBefore = settleBy
          meta = emptyMetadata
        transferLegs = fromList
          [ (legId, TransferLeg with
                sender; receiver; amount
                instrumentId = InstrumentId with admin = gp; id = instId
                meta = emptyMetadata) ]
        meta = emptyMetadata
      allocationRequest_RejectImpl _self _arg = pure (ChoiceExecutionMetadata with meta = emptyMetadata)
      allocationRequest_WithdrawImpl _self _arg = pure (ChoiceExecutionMetadata with meta = emptyMetadata)
```

> `admin = gp` in the leg matches our single-registry admin. If a leg's instrument admin differs (Vehicle/CashRegistry as distinct parties), thread the admin party through the template.

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Settlement.daml continuum-daml/tests/daml/Test/Settlement.daml
git commit -m "feat(daml): TransferLegRequest implements AllocationRequest"
```

### Task 7.2: Clearing math (pure functions) + rounding rule

**Files:**
- Create: `continuum-daml/contracts/daml/Continuum/Clearing.daml`
- Create: `continuum-daml/tests/daml/Test/Clearing.daml`

- [ ] **Step 1: Write the failing test — canonical numbers + roll-at-deal-price + buyer-only scaling**

```haskell
module Test.Clearing where

import Daml.Script
import DA.Assert ((===))
import Continuum.Clearing

canonicalCloseNumbers : Script ()
canonicalCloseNumbers = do
  let inp = ClearingInput with
        clearing = 0.96; rollNav = 31600000.0; sellNav = 20400000.0
        leadCap = 20400000.0; syndicateCap = 6000000.0
      r = computeClearing inp
  r.psaPrice        === 49920000.0
  r.buyerCash       === 19584000.0
  r.rollerUnits     === 30336000.0
  r.buyerUnits      === 19584000.0
  r.totalUnits      === 49920000.0
  -- rolls never scaled; buyers scaled only on oversubscription
  r.rollFillRatio   === 1.0

oversubscriptionScalesBuyersOnly : Script ()
oversubscriptionScalesBuyersOnly = do
  let inp = ClearingInput with
        clearing = 0.96; rollNav = 31600000.0; sellNav = 20400000.0
        leadCap = 12000000.0; syndicateCap = 20000000.0   -- lead 12 + syn 20 = 32 > 20.4
      r = computeClearing inp
  r.rollFillRatio === 1.0                 -- rolls untouched
  assert (r.buyerFillRatio < 1.0)         -- buyers scaled
  r.buyerCash === 19584000.0              -- still fills the whole sell pool at clearing
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement pure clearing**

```haskell
module Continuum.Clearing where

data ClearingInput = ClearingInput with
  clearing     : Decimal
  rollNav      : Decimal
  sellNav      : Decimal
  leadCap      : Decimal
  syndicateCap : Decimal

data ClearingResult = ClearingResult with
  demand         : Decimal
  sellNav        : Decimal
  psaPrice       : Decimal
  buyerCash      : Decimal
  rollerUnits    : Decimal
  buyerUnits     : Decimal
  totalUnits     : Decimal
  rollFillRatio  : Decimal
  buyerFillRatio : Decimal

-- Per-buyer allocation (matrix 4.2/4.3): lead filled first to capacity, then
-- syndicate pro-rata on the overflow; residual whole units to the lead.
data BuyerCommit = BuyerCommit with party : Party; capacity : Decimal; isLead : Bool
data BuyerFill   = BuyerFill   with party : Party; navFilled : Decimal; units : Decimal

allocateBuyers : Decimal -> Decimal -> [BuyerCommit] -> [BuyerFill]
allocateBuyers clearing sellPool commits =
  let lead = filter (.isLead) commits
      syn  = filter (not . (.isLead)) commits
      leadFill = sum (map (\c -> min c.capacity sellPool) lead)
      overflow = max 0.0 (sellPool - leadFill)
      synCap   = sum (map (.capacity) syn)
      fillOf c
        | c.isLead  = min c.capacity sellPool
        | synCap > 0.0 = roundDollar (overflow * (c.capacity / synCap))
        | otherwise = 0.0
  in [ let nav = fillOf c in BuyerFill c.party nav (roundDollar (clearing * nav)) | c <- commits ]

roundDollar : Decimal -> Decimal
roundDollar x = fromIntegral (round x : Int)

-- Close asserts `not (undersubscribed r)` (matrix 4.4: never force sellers to roll).
undersubscribed : ClearingResult -> Bool
undersubscribed r = r.demand < r.sellNav

computeClearing : ClearingInput -> ClearingResult
computeClearing i =
  let refNav      = i.rollNav + i.sellNav
      demand      = i.leadCap + i.syndicateCap                 -- total buyer capacity
      psaPrice    = roundDollar (i.clearing * refNav)
      -- the whole sell pool fills whenever demand >= sell; buyers absorb it
      filledSell  = min i.sellNav demand
      buyerCash   = roundDollar (i.clearing * filledSell)
      rollerUnits = roundDollar (i.clearing * i.rollNav)       -- roll at DEAL price
      buyerUnits  = roundDollar (i.clearing * filledSell)
      -- oversubscription scales each buyer's CAPACITY down to sell/demand (<1);
      -- exactly-/under-subscribed => 1.0. Rolls are NEVER scaled.
      buyerFill   = if demand > i.sellNav && demand > 0.0
                    then i.sellNav / demand
                    else 1.0
  in ClearingResult with
       demand; sellNav = i.sellNav
       psaPrice; buyerCash; rollerUnits; buyerUnits
       totalUnits = rollerUnits + buyerUnits
       rollFillRatio = 1.0                                     -- rolls never scaled
       buyerFillRatio = buyerFill
```

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Clearing.daml continuum-daml/tests/daml/Test/Clearing.daml
git commit -m "feat(daml): pure clearing math (roll-at-deal-price, buyer-only scaling)"
```

### Task 7.3a: Phase-1 allocate — each sender reserves its leg (own submission)

**Files:**
- Create: `continuum-daml/scripts/daml/Continuum/Settle.daml` (allocate helpers)
- Create: `continuum-daml/tests/daml/Test/AllocatePhase.daml`

- [ ] **Step 1: Write the failing test — a buyer allocates its cash leg against a disclosed factory; result is an `Allocation`**

```haskell
module Test.AllocatePhase where

import Daml.Script
import Continuum.Registry
import Continuum.Settle (allocateFor)
import Splice.Api.Token.HoldingV1
import Splice.Api.Token.AllocationV1

buyerAllocatesCashLeg : Script ()
buyerAllocatesCashLeg = do
  gp    <- allocateParty "GP"
  buyer <- allocateParty "Buyer"
  seller<- allocateParty "Seller"
  now <- getTime
  fac  <- submit gp do createCmd RegistryAllocationFactory with admin = gp
  cash <- submit gp do createCmd RegistryHolding with admin = gp; owner = buyer; instId = usdcId; amount = 19584000.0; locked = False; meta_ = mempty
  a <- allocateFor gp buyer seller fac usdcId 19584000.0 (toInterfaceContractId @Holding cash) now "cash"
  Some _ <- queryInterfaceContractId buyer a   -- an Allocation now exists
  pure ()
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement `allocateFor`** (reuses the disclosed-factory pattern proven in Spike A)

```haskell
module Continuum.Settle where

import Daml.Script
import Continuum.Registry (RegistryAllocationFactory)
import Splice.Api.Token.HoldingV1
import Splice.Api.Token.AllocationV1
import Splice.Api.Token.AllocationInstructionV1
import Splice.Api.Token.MetadataV1

allocateFor
  : Party -> Party -> Party -> ContractId RegistryAllocationFactory
  -> Text -> Decimal -> ContractId Holding -> Time -> Text
  -> Script (ContractId Allocation)
allocateFor admin sender receiver factory instId amount holdingCid now legId = do
  let spec = AllocationSpecification with
        settlement = SettlementInfo with
          executor = admin; settlementRef = Reference with id = legId; cid = None
          requestedAt = now; allocateBefore = now; settleBefore = now; meta = emptyMetadata
        transferLegId = legId
        transferLeg = TransferLeg with
          sender; receiver; amount
          instrumentId = InstrumentId with admin; id = instId; meta = emptyMetadata
  Some dF <- queryDisclosure admin factory
  res <- submit (actAs sender <> disclose dF) do
    exerciseCmd (toInterfaceContractId @AllocationFactory factory)
      AllocationFactory_Allocate with
        expectedAdmin = admin; allocation = spec; requestedAt = now
        inputHoldingCids = [holdingCid]
        extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
  case res.output of
    AllocationInstructionResult_Completed cid -> pure cid
    _ -> abort "allocate did not complete"
```

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/scripts/daml/Continuum/Settle.daml continuum-daml/tests/daml/Test/AllocatePhase.daml
git commit -m "feat(daml): phase-1 per-sender allocate helper (disclosed factory)"
```

### Task 7.3b: Phase-2 `Close` — executor executes all allocations + burns + mints

**Files:**
- Modify: `continuum-daml/contracts/daml/Continuum/Deal.daml` (add `Close`)
- Modify: `continuum-daml/contracts/daml/Continuum/Election.daml` (add a `Read` choice so Close can read disclosed elections)
- Create: `continuum-daml/tests/daml/Test/CloseChoice.daml`

- [ ] **Step 1: Add a reader-controlled `Read` to `LPElection`** (Close reads sealed elections via disclosure)

```haskell
-- in Continuum.Election, inside `template LPElection ... where`
data ElectionView = ElectionView with rollNav : Decimal; sellNav : Decimal; disclosureHash : BytesHex
  deriving (Eq, Show)
nonconsuming choice Read : ElectionView
  with reader : Party
  controller reader
  do pure (ElectionView with rollNav; sellNav; disclosureHash)
```

- [ ] **Step 2: Write the failing test — `Close` executes pre-created allocations, burns, mints units-with-meta**

```haskell
module Test.CloseChoice where

import Daml.Script
import DA.Assert ((===))
import Continuum.Deal
import Splice.Api.Token.AllocationV1

closeExecutesAllLegs : Script ()
closeExecutesAllLegs = do
  -- minimal 1-buyer/1-roller world assembled inline; allocations pre-created via allocateFor
  ClosePrep{..} <- prepMinimalClose
  submit gp do
    exerciseCmd dealCid Close with
      basisCid; legAllocs = [cashAlloc, unitAlloc]; burns = [(accParticipation, oldInterest)]
      valuationHash = valHash
  sellerHs <- query @Continuum.Registry.RegistryHolding seller
  [ h.amount | (_, h) <- sellerHs ] === [19584000.0]
  -- interest burned
  gone <- query @Continuum.Participation.OldFundInterest lp
  gone === []
```

- [ ] **Step 3: Implement the `Close` choice — phase 2 only (execute + burn + mint + receipts)**

```haskell
-- Continuum.Deal (add)
import Continuum.Issuance (IssuanceBasis, ValidateIssuance)
import Continuum.Participation (AcceptedParticipation, BurnFor, OldFundInterest)
import Splice.Api.Token.AllocationV1
import Splice.Api.Token.MetadataV1
import DA.Foldable (forA_)

    choice Close : ()
      with
        basisCid      : ContractId IssuanceBasis
        legAllocs     : [ContractId Allocation]                       -- pre-created by senders (7.3a)
        burns         : [(ContractId AcceptedParticipation, ContractId OldFundInterest)]
        valuationHash : Text
      controller gp
      do assertMsg "must be consented" (stage == Consented || stage == Electing)
         -- 1. gate on the antecedent DAG
         _ <- exercise basisCid ValidateIssuance
         -- 2. execute every pre-allocated leg atomically (executor authority = gp)
         forA_ legAllocs \a ->
           exercise a Allocation_ExecuteTransfer with
             extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
         -- 3. burn each LP's co-signed old interest via its delegation
         forA_ burns \(p, oi) -> exercise p BurnFor with interestCid = oi
         -- (unit legs already carry ("continuum/valuation-sha256", valuationHash) in their
         --  TransferLeg.meta, set when the vehicle allocated them in 7.3a; the receiver
         --  Holding.meta_ is populated from leg.meta by the registry's execute impl.)
         create this with stage = Closed
         pure ()
```

> `prepMinimalClose`/`ClosePrep` live in `scripts/Continuum/Settle.daml`: allocate the parties, mint, publish docs + `IssuanceBasis`, create the `AcceptedParticipation` + `OldFundInterest`, run phase-1 `allocateFor` for each leg (unit legs pass `meta` carrying the valuation hash), and return the cids `Close` consumes.

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Deal.daml continuum-daml/contracts/daml/Continuum/Election.daml continuum-daml/scripts/daml/Continuum/Settle.daml continuum-daml/tests/daml/Test/CloseChoice.daml
git commit -m "feat(daml): phase-2 Close executes allocations + burns + provenance"
```

### Task 7.3c: Full-deal Scenario + conservation acceptance test (matrix group 5)

**Files:**
- Create: `continuum-daml/scripts/daml/Continuum/Scenario.daml`
- Create: `continuum-daml/tests/daml/Test/Conservation.daml`

- [ ] **Step 1: Write the failing conservation test — the whole deal #1 ties out on-ledger**

```haskell
module Test.Conservation where

import Daml.Script
import DA.Assert ((===))
import Continuum.Scenario (setupAndClose, ClosedWorld(..))

conservationTiesOut : Script ()
conservationTiesOut = do
  w <- setupAndClose
  w.exitingCashTotal      === 19584000.0
  w.rollerUnitsTotal      === 30336000.0
  w.buyerUnitsTotal       === 19584000.0
  w.totalUnits            === 49920000.0
  w.oldInterestsRemaining === 0
  assert w.unitsCarryValuationHash
```

- [ ] **Step 2: Implement `setupAndClose : Script ClosedWorld`** in `Scenario.daml` — seed the full 8-LP/4-buyer deal (incl. one non-electing LP), run phase-1 `allocateFor` for all legs, `exercise dealCid Close`, then query the ACS and total cash/units/interests into a `ClosedWorld` record.

```haskell
data ClosedWorld = ClosedWorld with
  exitingCashTotal      : Decimal
  rollerUnitsTotal      : Decimal
  buyerUnitsTotal       : Decimal
  totalUnits            : Decimal
  oldInterestsRemaining : Int
  unitsCarryValuationHash : Bool
```

- [ ] **Step 3: Run — iterate until pass; Step 4: Commit**

```bash
git add continuum-daml/scripts/daml/Continuum/Scenario.daml continuum-daml/tests/daml/Test/Conservation.daml
git commit -m "feat(daml): full deal Scenario + conservation acceptance (group 5)"
```

### Task 7.4: Atomicity — all-or-nothing (matrix group 6)

**Files:**
- Create: `continuum-daml/tests/daml/Test/Atomicity.daml`

- [ ] **Step 1: Write the test — sabotage one leg → whole close fails, ledger unchanged**

```haskell
module Test.Atomicity where

import Daml.Script
import Continuum.Scenario (setupPreClose, ClosePrep(..), worldAcs, runClose)
import Splice.Api.Token.AllocationV1
import Splice.Api.Token.MetadataV1

closeIsAllOrNothing : Script ()
closeIsAllOrNothing = do
  prep <- setupPreClose                       -- allocations pre-created (phase 1 done)
  before <- worldAcs prep
  -- SABOTAGE: a buyer withdraws its own allocation (controller = sender). This is the
  -- correct sabotage vector — the buyer cannot archive its admin-signed Holding directly.
  _ <- submit prep.buyer do
    exerciseCmd prep.cashAlloc Allocation_Withdraw with
      extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
  -- Close now references a consumed allocation -> whole close fails
  submitMustFail prep.gp do runClose prep
  after <- worldAcs prep
  assert (before == after)                    -- no cash moved, no units minted, no interest burned
```

- [ ] **Step 2: Implement `setupPreClose`/`worldAcs`/`runClose` helpers in `Scenario.daml`; run — expect pass; Step 3: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Scenario.daml continuum-daml/tests/daml/Test/Atomicity.daml
git commit -m "test(daml): close is all-or-nothing (byte-identical rollback on failure)"
```

---

## Phase 8 — Gating, defaults, privacy, documents (remaining matrix groups)

### Task 8.1: Sequencing/gating (group 1) — LPAC-before-elections, price-before-elections, close-needs-basis

**Files:** Create `continuum-daml/tests/daml/Test/Sequencing.daml`

- [ ] **Step 1: Write negatives** — `OpenElections` without `LPACConsent` → `submitMustFail`; `OpenElections` with `clearingPrice = None` → `submitMustFail`; `Close` without a valid `IssuanceBasis` → `submitMustFail`; re-`Close` → `submitMustFail`.
- [ ] **Step 2: Add `OpenElections` (controller gp, requires consent + clearing set) to `Deal.daml` if not present.**
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "test(daml): sequencing gates (group 1)"`

### Task 8.2: Default-to-sell needs no LP signature (group 8.7)

**Files:** Create `continuum-daml/tests/daml/Test/DefaultSell.daml`

- [ ] **Step 1: Write the test** — an LP with an `OldFundInterest` but NO `LPElection` is settled as SELL: receives cash, zero units, its interest burned — with **no submission by that LP after the election deadline** (the close acts via `AcceptedParticipation` authority created before the deadline).
- [ ] **Step 2: Ensure `Scenario.setupAndClose` includes one non-electing LP; assert `unitsOf nonElector == 0` and `cashOf nonElector == navOf nonElector * 0.96`.**
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "test(daml): default-to-sell requires no post-deadline LP signature (8.7)"`

### Task 8.3: Privacy (group 7) — GP blind mid-window, regulator scoped post-close

**Files:** Create `continuum-daml/tests/daml/Test/Privacy.daml`

- [ ] **Step 1: Write** — during the election window, `query @LPElection gp == []` (contents), only `ElectionFiled` visible; `query @SealedBid <otherBuyer> == []`; regulator sees nothing deal-related pre-close (`query @SettlementReceipt regulator == []`), and after `Close` sees exactly a `FairnessDisclosure` (add that template: signatory gp, observer regulator, carrying clearing + aggregates + fairness hash, NOT per-LP data).
- [ ] **Step 2: Add `SettlementReceipt` (observer room) + `FairnessDisclosure` (observer regulator) creation to `Close`.**
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "test(daml): privacy — GP blind mid-window, regulator scoped post-close (group 7)"`

### Task 8.4: Document/valuation anchoring (group 9)

**Files:** Create `continuum-daml/tests/daml/Test/Documents.daml`

- [ ] **Step 1: Write** (the `IssuanceBasis` gate + fields already exist from Task 5.2 — this task only exercises them): `ValidateIssuance` (and thus `Close`) fails with a stale valuation (9.5: set `closeDate` beyond `maxAsOfDays` past `asOfDate`, using `setTime`/`passTime` on the `--static-time` sandbox); `clearing ∉ [fairLow,fairHigh]` → fails (9.3); creating a `ValuationReport` with `agent == gp` fails the `ensure` (9.1); dropping any antecedent cid from the basis and validating → fails (9.2); two `ValuationReport`s, reconciled NAV outside one range → fails, inside both → passes (9.4); an `LPElection.disclosureHash` ≠ the seeded `DisclosureDocument` hash → rejected at close (9.6 — add this check to `Close`: fetch each election's `disclosureHash` via `Read` and assert it equals the deal's disclosure hash); minted unit `Holding.meta_` contains `("continuum/valuation-sha256", h)` (9.8); a `Buyer`/other-LP `queryContractId` on the disclosed `ValuationReport` returns `None` (9.9).
- [ ] **Step 2: Add the disclosure-hash equality check to `Close` (fetch elections via `Read`, assert against the deal disclosure hash).**
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "test(daml): document + valuation anchoring (group 9)"`

### Task 8.5: Edge cases (group 8 stretch) + price/allocation (groups 3,4)

**Files:** Create `continuum-daml/tests/daml/Test/PriceAlloc.daml`, `continuum-daml/tests/daml/Test/Edge.daml`

- [ ] **Step 1: Price/alloc** — single clearing price for all buyers incl. syndicate MFN (3.1); exiting haircut uniform (3.2); syndicate fills only overflow (4.3); undersubscription → close fails/breaks (4.4).
- [ ] **Step 2: Edge (stretch)** — over-roll rejected (8.1, ensure already blocks); zero/negative rejected (8.2); all-roll no divide-by-zero (8.4: `computeClearing` with `sellNav = 0.0` returns `buyerFillRatio = 1.0`, no crash); all-sell (8.5); GP self-dealing guard (8.11: `SealedBid` with `buyer == gp` → `submitMustFail`); stale NAV (8.12).
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "test(daml): price/allocation (3,4) + edge cases (8)"`

---

## Phase 9 — Seed, flywheel, end-to-end on the sandbox

### Task 9.1: Re-runnable Seed script

**Files:** Create `continuum-daml/scripts/daml/Continuum/Seed.daml` (scripts package — has daml-script)

- [ ] **Step 1: Write `seedDeal1 : Script SeedResult`** — allocate all parties (`GP` [also vehicle/oldFund/registry-admin per the MVP party model], `LPAC`, `Regulator`, `ValuationAgent`, `FairnessProvider`, `Issuer`, 8 LPs, 4 buyers); create `RegistryAllocationFactory`; mint USDC to buyers and the unit treasury + Atlas asset to `gp`; create each `OldFundInterest` with `submitMulti [gp, lp] []`; issue `EligibilityCredential`s; publish `ValuationReport`/`FairnessOpinion`/`DisclosureDocument` with `sha256` of sample payloads; create `ContinuationDeal`. Return party ids + cids in `SeedResult`.
- [ ] **Step 2: Test** `tests/daml/Test/Seed.daml` runs `seedDeal1` and asserts the ACS has the expected counts.
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "feat(daml): re-runnable Seed script for deal #1"`

### Task 9.2: Deal-#2 flywheel

**Files:** Modify `Continuum/Seed.daml`; create `tests/daml/Test/Flywheel.daml`

- [ ] **Step 1: Write the test** — after deal #1, a returning buyer's `EligibilityCredential` (unrevoked) is reused to `SubmitBid` on a second `ContinuationDeal` (Brightwater) in one submission, with no re-issuance.
- [ ] **Step 2: Implement `seedDeal2Reusing : SeedResult -> Script ()`.**
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "feat(daml): deal-#2 flywheel reuses eligibility credential"`

### Task 9.3: Full-matrix run

- [ ] **Step 1: Run the whole suite**

Run: `cd continuum-daml && dpm build --all && dpm test`
Expected: all suites (groups 1–9 + spikes) PASS.

- [ ] **Step 2: Commit** `git commit -m "test(daml): full business-rule matrix green" --allow-empty`

### Task 9.4: End-to-end on a live sandbox

**Files:** Create `continuum-daml/e2e/run.sh`

- [ ] **Step 1: Write the e2e script**

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
dpm build --all
CONTRACTS="contracts/.daml/dist/continuum-contracts-1.0.0.dar"
SCRIPTS="scripts/.daml/dist/continuum-scripts-1.0.0.dar"   # data-depends on contracts
# start a static-time sandbox (setTime/passTime need static time), preload both DARs
dpm sandbox --static-time --dar "$CONTRACTS" --dar "$SCRIPTS" --port 6865 &
SANDBOX_PID=$!
trap "kill $SANDBOX_PID" EXIT
# readiness: poll the ledger with a trivial no-op script (does NOT double-seed)
until dpm script --ledger-host localhost --ledger-port 6865 --dar "$SCRIPTS" \
      --script-name Continuum.Scenario:ping 2>/dev/null; do sleep 2; done
# run the full deal close + conservation assertions against the live ledger
dpm script --ledger-host localhost --ledger-port 6865 --dar "$SCRIPTS" \
  --script-name Continuum.Scenario:setupCloseAndAssert
echo "E2E OK: deal closed and conservation asserted on a live ledger"
```

- [ ] **Step 2: Add `ping : Script ()` (`pure ()`) and `setupCloseAndAssert : Script ()` (runs `setupAndClose` and `assert`s the §5 identities) to `Continuum.Scenario`.**

- [ ] **Step 3: Run**

Run: `chmod +x continuum-daml/e2e/run.sh && continuum-daml/e2e/run.sh`
Expected: prints "E2E OK …"; exit 0.

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/e2e/run.sh continuum-daml/scripts/daml/Continuum/Scenario.daml
git commit -m "test(daml): end-to-end close on a live canton sandbox"
```

---

## Self-review notes (author checklist — completed)

- **Spec coverage:** parties, 3 instruments (generic registry), all templates (Deal, Participation/OldFundInterest, Credential, SealedBid/BidFiled, Valuation/Fairness, AuctionCertificate, Disclosure, PSA, IssuanceBasis, Consent, Election/marker, TransferLegRequest, SettlementReceipt/FairnessDisclosure), atomic Close, provenance meta, and test groups 1–9 each map to a task. Devnet/UI intentionally excluded (out of scope).
- **Roll-at-deal-price** enforced in `computeClearing` and asserted (7.2, 5).
- **Units = PSA price**, not valuation NAV: `IssuanceBasis.ValidateIssuance` checks `psaPrice == clearing × reconciledNav`; units come from clearing result, gated on the basis (5.2, 7.3).
- **Default-to-sell without LP signature** via `AcceptedParticipation` created pre-deadline (3.3, 8.2).
- **Type consistency:** `RegistryHolding`/`mint`/`InstrumentId`/`computeClearing`/`ClearingResult` field names are used identically across tasks.

## Fable plan-review fixes applied (2026-07-09)

Applied before execution: **(1)** two-phase settlement — senders allocate pre-close, `Close` only executes (Task 7.3a/b/c) — the plan's Close is now executable; **(2)** MVP party model pinned (`gp = vehicle = oldFund = registry admin`); co-signed creates use `submitMulti`; **(3)** reader-controller convention on every disclosure-fetch choice (Spike B, `SignedDocument`, `LPElection.Read`); **(4)** factory disclosed to senders in every allocate (Spike A + `allocateFor`); **(5)** registry validates input holdings (owner/instrument/unlocked); **(6)** `computeClearing` scaling fixed (oversubscription scales buyers only; undersubscription → fail/Break) + per-buyer `allocateBuyers`; **(7)** full `IssuanceBasis` (antecedent cids + fairness/staleness/consent checks) defined in Task 5.2, not retrofitted; **(8)** recusal derived from on-ledger `BidFiled` × roster (Decision 9); **(9)** Seed/Scenario moved to a `scripts/` package (daml-script, not in the uploaded contracts DAR); **(10)** `e2e/run.sh` uses `--ledger-port`, both DARs, and a `ping` readiness script; **(11)** Spike A promoted to the full multi-sender settlement dress rehearsal (the go/no-go gate); plus nits (`ensure buyer /= gp`, `mkDeal` function not `undefined`, dropped colliding imports, sabotage via `Allocation_Withdraw`).

## Known-risk follow-ups (resolve during execution, not blockers to starting)

- **Interface signatures:** the `interface instance` method names/records in Tasks 1.1 & 7.1 are reconstructed from the docs; Task 0.3 + Spike A validate them against the real DARs — fix against the compiler if any differ.
- **cn-quickstart AllocationRequest:** if `TransferLegRequest` implementation diverges, pull the reference `License.daml` from the cn-quickstart repo for the exact `interface instance AllocationRequest` shape.
- **`admin` party for units/asset:** the plan uses a single `gp`/registry admin; if `Vehicle`/`CashRegistry` are modeled as distinct admin parties, thread the admin through `RegistryHolding`/`TransferLegRequest` (a mechanical change).
