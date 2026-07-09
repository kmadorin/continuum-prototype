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
- Two packages: `continuum-daml/contracts/` and `continuum-daml/tests/`, tied by `continuum-daml/multi-package.yaml`.
- Module prefix `Continuum.` for our code; tests are `Test.<Group>`.
- Commit after every task with the message shown. Run `dpm build --all` (from `continuum-daml/`) before every `dpm test`.
- **TDD everywhere:** write the failing Script test, run it, see it fail, implement, run it, see it pass, commit.

---

## Phase 0 — Scaffold, dependencies, version pinning

### Task 0.1: Create the two-package workspace

**Files:**
- Create: `continuum-daml/multi-package.yaml`
- Create: `continuum-daml/contracts/daml.yaml`
- Create: `continuum-daml/tests/daml.yaml`
- Create: `continuum-daml/contracts/daml/Continuum/Types.daml`
- Create: `continuum-daml/.gitignore`

- [ ] **Step 1: Write `multi-package.yaml`**

```yaml
# continuum-daml/multi-package.yaml
packages:
  - ./contracts
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

- [ ] **Step 3: Write `tests/daml.yaml`**

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
  - ../dars/splice-api-token-metadata-v1.dar
  - ../dars/splice-api-token-holding-v1.dar
  - ../dars/splice-api-token-allocation-v1.dar
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

### Task 1.1: Spike A — generic Holding + one allocate→execute leg

This validates our reconstructed interface signatures against the real DARs. If a signature differs, fix it HERE and propagate.

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
        -- fetch + archive the input holdings, summing their amounts
        inputs <- forA arg.inputHoldingCids \hcid -> do
          let rcid = coerceContractId hcid : ContractId RegistryHolding
          h <- fetch rcid
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

- [ ] **Step 2: Write the failing spike test**

```haskell
module Test.SpikeAllocation where

import Daml.Script
import DA.Assert ((===))
import Continuum.Registry
import Splice.Api.Token.HoldingV1
import Splice.Api.Token.AllocationV1
import Splice.Api.Token.AllocationInstructionV1
import Splice.Api.Token.MetadataV1

spikeOneLeg : Script ()
spikeOneLeg = do
  admin <- allocateParty "Registry"
  alice <- allocateParty "Alice"
  bob   <- allocateParty "Bob"
  -- mint 100 to Alice
  h <- submit admin do createCmd RegistryHolding with
    admin; owner = alice; instId = "USDC"; amount = 100.0; locked = False; meta_ = emptyTextMap
  factory <- submit admin do createCmd RegistryAllocationFactory with admin
  now <- getTime
  let leg = TransferLeg with
        sender = alice; receiver = bob; amount = 40.0
        instrumentId = InstrumentId with admin; id = "USDC"; meta = emptyMetadata
      spec = AllocationSpecification with
        settlement = SettlementInfo with
          executor = admin; settlementRef = Reference with id = "s1"; cid = None
          requestedAt = now; allocateBefore = now; settleBefore = now; meta = emptyMetadata
        transferLegId = "leg1"; transferLeg = leg
  -- allocate (sender authorizes)
  res <- submit alice do
    exerciseCmd (toInterfaceContractId @AllocationFactory factory)
      AllocationFactory_Allocate with
        expectedAdmin = admin; allocation = spec; requestedAt = now
        inputHoldingCids = [toInterfaceContractId @Holding h]
        extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
  allocCid <- case res.output of
    AllocationInstructionResult_Completed cid -> pure cid
    _ -> abort "allocate did not complete"
  -- execute (executor = admin)
  _ <- submit admin do
    exerciseCmd allocCid Allocation_ExecuteTransfer with
      extraArgs = ExtraArgs with context = emptyChoiceContext; meta = emptyMetadata
  -- Bob now holds 40, Alice holds 60 change
  bobHs <- query @RegistryHolding bob
  map (.amount) [h | (_, h) <- bobHs, h.owner == bob] === [40.0]
  pure ()
```

- [ ] **Step 3: Run — expect failure first, then pass after Registry compiles**

Run: `cd continuum-daml && dpm build --all && dpm test --files tests/daml/Test/SpikeAllocation.daml`
Expected: first iteration fails to compile (Registry incomplete/mismatched); after fixing signatures, `spikeOneLeg` PASSES (Bob holds 40, Alice change 60).

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Registry.daml continuum-daml/tests/daml/Test/SpikeAllocation.daml
git commit -m "feat(daml): generic Token-Standard registry + one-leg allocate/execute spike"
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
    nonconsuming choice Reveal : Decimal
      controller owner
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
  -- Buyer discloses to GP; GP can now use it in a submission
  Some d <- queryDisclosure buyer cid
  v <- submit (actAs gp <> disclose d) do exerciseCmd cid Reveal
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
    nonconsuming choice FetchDoc : SignedDocument
      controller attestor
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
  _ <- submit gp do createAndExerciseCmd (RegistryAllocationFactory with admin = gp) Archive
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

-- a reusable sample for tests
sampleDeal : ContinuationDeal
sampleDeal = ContinuationDeal with
  gp = undefined  -- filled by `with gp` at call sites in tests
  vehicle = undefined; oldFund = undefined; lpac = undefined; regulator = undefined
  room = []; fund = "Meridian Growth Fund III"; cv = "Meridian CV I"; asset = "Project Atlas"
  refNav = 52000000.0; electionDeadline = time (date 1970 Jan 1) 0 0 0
  clearingPrice = None; gpCommitment = 0.0; carryCrystallized = 0.0; stage = Setup
```

> Note: `sampleDeal with gp` in the test overrides only `gp`; extend the test helper to set `vehicle`, `oldFund`, `lpac`, `regulator` to `gp` for the single-party stage tests, or allocate distinct parties. Prefer distinct parties once Task 3.3 lands.

- [ ] **Step 4: Fix the test to supply all parties, run — expect pass**

Update `dealBreakGoesToBroken` to `createCmd sampleDeal with gp; vehicle = gp; oldFund = gp; lpac = gp; regulator = gp`.
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
  gp <- allocateParty "GP"
  lp <- allocateParty "LP"
  oi <- submit lp do createCmd OldFundInterest with oldFund = gp, lp, nav = 5000000.0
  -- GP cannot archive the LP-co-signed interest unilaterally
  submitMustFail gp do archiveCmd oi
  -- with a DealParticipation (LP+GP co-signed), GP can burn via BurnFor
  part <- submit lp do createCmd DealParticipation with gp, lp
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
    ensure pctOfNav > 0.0 && pctOfNav <= 1.0 && capacity > 0.0
    choice Withdraw : ()
      controller buyer
      do pure ()

template BidFiled            -- contentless marker: GP sees THAT a bid is in
  with
    gp     : Party
    buyer  : Party
    dealId : Text
  where
    signatory buyer
    observer gp
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

- [ ] **Step 1: Write the failing test — basis validates price = clearing × NAV, dates fresh, all antecedents present**

```haskell
module Test.Issuance where

import Daml.Script
import Continuum.Issuance

issuanceBasisValidates : Script ()
issuanceBasisValidates = do
  gp <- allocateParty "GP"
  let basis = IssuanceBasis with
        gp; dealId = "D1"; reconciledNav = 52000000.0; clearingPct = 0.96
        psaPrice = 49920000.0; reconciliation = InRangeOfAll
  cid <- submit gp do createCmd basis
  -- validate: psaPrice == clearing × reconciledNav
  ok <- submit gp do exerciseCmd cid ValidateIssuance
  assert ok
  -- a mismatched price is rejected
  let bad = basis with psaPrice = 50000000.0
  badCid <- submit gp do createCmd bad
  submitMustFail gp do exerciseCmd badCid ValidateIssuance
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement**

```haskell
module Continuum.Issuance where

data Reconciliation = InRangeOfAll | LowerOf | Midpoint deriving (Eq, Show)

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

template IssuanceBasis
  with
    gp             : Party
    dealId         : Text
    reconciledNav  : Decimal
    clearingPct    : Decimal
    psaPrice       : Decimal
    reconciliation : Reconciliation
  where
    signatory gp
    choice ValidateIssuance : Bool
      controller gp
      do assertMsg "psaPrice must equal clearing × reconciledNav"
           (psaPrice == roundDollar (clearingPct * reconciledNav))
         pure True

-- round to whole dollars (cents rule for cash is applied in Close)
roundDollar : Decimal -> Decimal
roundDollar x = fromIntegral (round x : Int)
```

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

- [ ] **Step 1: Write the failing test (matrix 8.6) — a consent whose recusals don't cover an LPAC-member-who-bid is rejected**

```haskell
module Test.Consent where

import Daml.Script
import Continuum.Consent

recusalMustCoverBiddingMembers : Script ()
recusalMustCoverBiddingMembers = do
  lpac <- allocateParty "LPAC"
  gp   <- allocateParty "GP"
  m1   <- allocateParty "Member1"   -- also a bidder
  -- consent that omits m1 from recusals but m1 is in biddingMembers -> Grant fails
  req <- submit gp do createCmd LPACConsentRequest with
    gp; lpac; dealId = "D1"; biddingMembers = [m1]; recusals = []
  submitMustFail lpac do exerciseCmd req Grant
  -- consent that recuses m1 -> Grant succeeds
  req2 <- submit gp do createCmd LPACConsentRequest with
    gp; lpac; dealId = "D1"; biddingMembers = [m1]; recusals = [m1]
  _ <- submit lpac do exerciseCmd req2 Grant
  pure ()
```

- [ ] **Step 2: Run — expect fail; Step 3: Implement**

```haskell
module Continuum.Consent where

import DA.List (nub)
import DA.Foldable (all)

template LPACConsentRequest
  with
    gp             : Party
    lpac           : Party
    dealId         : Text
    biddingMembers : [Party]   -- LPAC members detected as bidders (from BidFiled × roster)
    recusals       : [Party]
  where
    signatory gp
    observer lpac
    choice Grant : ContractId LPACConsent
      controller lpac
      do assertMsg "recusals must cover all bidding LPAC members"
           (all (`elem` recusals) biddingMembers)
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
  psaPrice       : Decimal
  buyerCash      : Decimal
  rollerUnits    : Decimal
  buyerUnits     : Decimal
  totalUnits     : Decimal
  rollFillRatio  : Decimal
  buyerFillRatio : Decimal

roundDollar : Decimal -> Decimal
roundDollar x = fromIntegral (round x : Int)

computeClearing : ClearingInput -> ClearingResult
computeClearing i =
  let refNav       = i.rollNav + i.sellNav
      psaPrice     = roundDollar (i.clearing * refNav)
      filledSell   = min i.sellNav (i.leadCap + i.syndicateCap)
      buyerCash    = roundDollar (i.clearing * filledSell)
      rollerUnits  = roundDollar (i.clearing * i.rollNav)      -- roll at deal price
      buyerUnits   = roundDollar (i.clearing * filledSell)
      totalUnits   = rollerUnits + buyerUnits
      buyerFill    = if i.sellNav > 0.0 then filledSell / i.sellNav else 1.0
  in ClearingResult with
       psaPrice; buyerCash; rollerUnits; buyerUnits; totalUnits
       rollFillRatio = 1.0                                     -- rolls never scaled
       buyerFillRatio = buyerFill
```

- [ ] **Step 4: Run — expect pass; Step 5: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Clearing.daml continuum-daml/tests/daml/Test/Clearing.daml
git commit -m "feat(daml): pure clearing math (roll-at-deal-price, buyer-only scaling)"
```

### Task 7.3: The atomic Close choice (gate + legs + burns + provenance)

**Files:**
- Modify: `continuum-daml/contracts/daml/Continuum/Deal.daml` (add `Close`)
- Create: `continuum-daml/tests/daml/Test/Conservation.daml`

- [ ] **Step 1: Write the failing conservation test (matrix group 5) — full close ties out on-ledger**

```haskell
module Test.Conservation where

import Daml.Script
import DA.Assert ((===))
import Continuum.Scenario (setupAndClose, ClosedWorld(..))

conservationTiesOut : Script ()
conservationTiesOut = do
  w <- setupAndClose
  w.exitingCashTotal === 19584000.0
  w.rollerUnitsTotal === 30336000.0
  w.buyerUnitsTotal  === 19584000.0
  w.totalUnits       === 49920000.0
  -- old interests all burned
  w.oldInterestsRemaining === 0
  -- provenance: minted units carry the valuation hash
  assert w.unitsCarryValuationHash
```

- [ ] **Step 2: Implement a `Continuum.Scenario` helper that wires the whole flow and a `Close` choice on the deal**

Add `Close` to `ContinuationDeal` (in `Deal.daml`), which: validates the `IssuanceBasis` (disclosed), computes clearing via `Continuum.Clearing`, creates `TransferLegRequest`s, drives `AllocationFactory_Allocate` per sender + `Allocation_ExecuteTransfer` per leg, burns each `OldFundInterest` via `AcceptedParticipation.BurnFor`, and mints units with `meta_` carrying `("continuum/valuation-sha256", hash)`. Create `contracts/daml/Continuum/Scenario.daml` that seeds parties/instruments/docs/elections and calls `Close`, returning a `ClosedWorld` record of the measured totals.

```haskell
-- Continuum.Deal (add)
import Continuum.Clearing
import Continuum.Registry (RegistryHolding, mint, unitId)
-- ... Close choice signature:
    choice Close : ()
      with
        basisCid    : ContractId Continuum.Issuance.IssuanceBasis
        input       : ClearingInput
        valuationHash : Text
        -- (roster of elections, leg senders, participations threaded in)
      controller gp
      do assertMsg "must be consented" (stage == Consented || stage == Electing)
         _ <- exercise basisCid Continuum.Issuance.ValidateIssuance
         let r = computeClearing input
         -- ... create+allocate+execute the 4 legs; burn interests; mint units with meta
         pure ()
```

> This is the integrating task: keep each sub-action (allocate a leg, execute a leg, burn one interest, mint units-with-meta) as a small helper in `Scenario.daml`, unit-tested by the earlier spikes. The conservation test is the acceptance test for the whole batch.

- [ ] **Step 3: Run — iterate until pass**

Run: `dpm build --all && dpm test --files tests/daml/Test/Conservation.daml`
Expected: PASS — all six equalities hold and interests are burned.

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/contracts/daml/Continuum/Deal.daml continuum-daml/contracts/daml/Continuum/Scenario.daml continuum-daml/tests/daml/Test/Conservation.daml
git commit -m "feat(daml): atomic Close — gate, clearing, allocation batch, burns, provenance"
```

### Task 7.4: Atomicity — all-or-nothing (matrix group 6)

**Files:**
- Create: `continuum-daml/tests/daml/Test/Atomicity.daml`

- [ ] **Step 1: Write the test — sabotage one leg → whole close fails, ledger unchanged**

```haskell
module Test.Atomicity where

import Daml.Script
import Continuum.Scenario (setupPreClose, sabotageOneLeg, closeWorld, worldAcs)

closeIsAllOrNothing : Script ()
closeIsAllOrNothing = do
  w0 <- setupPreClose
  before <- worldAcs w0
  w1 <- sabotageOneLeg w0            -- e.g. withdraw a buyer's cash holding
  submitMustFail (closeParty w1) do closeWorld w1
  after <- worldAcs w1
  -- no cash moved, no units minted, no interest burned
  assert (before == after)
```

- [ ] **Step 2: Implement the `sabotageOneLeg`/`worldAcs` helpers in `Scenario.daml`; run — expect pass; Step 3: Commit**

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

- [ ] **Step 1: Write** — `Close` fails without a `ValuationReport` (9.1) and if `agent == gp` (ensure already blocks creation, so test creation fails); missing any `IssuanceBasis` antecedent → `Close` fails (9.2); `clearing ∉ [fairLow,fairHigh]` → fails (9.3); two `ValuationReport`s with price outside either range → fails, inside both → passes (9.4); staleness gap beyond max → fails (9.5); an `LPElection.disclosureHash` not matching the current `DisclosureDocument` → rejected at close (9.6); minted unit `meta` contains the valuation hash (9.8); a non-stakeholder query cannot see the disclosed `ValuationReport` (9.9).
- [ ] **Step 2: Thread `maxAsOfGap` + date checks + disclosure-hash check into `IssuanceBasis.ValidateIssuance` and `Close`.**
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "test(daml): document + valuation anchoring (group 9)"`

### Task 8.5: Edge cases (group 8 stretch) + price/allocation (groups 3,4)

**Files:** Create `continuum-daml/tests/daml/Test/PriceAlloc.daml`, `continuum-daml/tests/daml/Test/Edge.daml`

- [ ] **Step 1: Price/alloc** — single clearing price for all buyers incl. syndicate MFN (3.1); exiting haircut uniform (3.2); syndicate fills only overflow (4.3); undersubscription → close fails/breaks (4.4).
- [ ] **Step 2: Edge (stretch)** — over-roll rejected (8.1, ensure already blocks); zero/negative rejected (8.2); all-roll no divide-by-zero (8.4: `computeClearing` with `sellNav = 0.0` returns `buyerFillRatio = 1.0`, no crash); all-sell (8.5); GP self-dealing guard (8.11: `SealedBid` with `buyer == gp` → `submitMustFail`); stale NAV (8.12).
- [ ] **Step 3: Run — expect pass; Step 4: Commit** `git commit -m "test(daml): price/allocation (3,4) + edge cases (8)"`

---

## Phase 9 — Seed, flywheel, end-to-end on the sandbox

### Task 9.1: Re-runnable Seed script

**Files:** Create `continuum-daml/contracts/daml/Continuum/Seed.daml`

- [ ] **Step 1: Write `seedDeal1 : Script SeedResult`** — allocate all parties (`GP`, `Vehicle`, `OldFund`, `LPAC`, `Regulator`, `ValuationAgent`, `FairnessProvider`, `Issuer`, 8 LPs, 4 buyers); create `RegistryAllocationFactory`; mint USDC to buyers, unit treasury to `Vehicle`, the Atlas asset to `OldFund`, `OldFundInterest` per LP; issue `EligibilityCredential`s; publish `ValuationReport`/`FairnessOpinion`/`DisclosureDocument` with `sha256` of sample payloads; create `ContinuationDeal`. Return party ids + cids in `SeedResult`.
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
DAR="contracts/.daml/dist/continuum-contracts-1.0.0.dar"
# start a static-time sandbox with the DAR preloaded, in the background
dpm sandbox --static-time --dar "$DAR" --port 6865 &
SANDBOX_PID=$!
trap "kill $SANDBOX_PID" EXIT
# wait for the ledger to be ready
until dpm script --ledger-host localhost --port 6865 --dar "$DAR" \
      --script-name Continuum.Seed:seedDeal1 2>/dev/null; do sleep 2; done
# run the full deal close against the live ledger
dpm script --ledger-host localhost --port 6865 --dar "$DAR" \
  --script-name Continuum.Scenario:setupCloseAndAssert
echo "E2E OK: deal closed and conservation asserted on a live ledger"
```

- [ ] **Step 2: Make `Continuum.Scenario:setupCloseAndAssert` a `Script ()` that runs the full flow and `assert`s the §5 identities on the running ledger.**

- [ ] **Step 3: Run**

Run: `chmod +x continuum-daml/e2e/run.sh && continuum-daml/e2e/run.sh`
Expected: prints "E2E OK …"; exit 0.

- [ ] **Step 4: Commit**

```bash
git add continuum-daml/e2e/run.sh continuum-daml/contracts/daml/Continuum/Scenario.daml
git commit -m "test(daml): end-to-end close on a live canton sandbox"
```

---

## Self-review notes (author checklist — completed)

- **Spec coverage:** parties, 3 instruments (generic registry), all templates (Deal, Participation/OldFundInterest, Credential, SealedBid/BidFiled, Valuation/Fairness, AuctionCertificate, Disclosure, PSA, IssuanceBasis, Consent, Election/marker, TransferLegRequest, SettlementReceipt/FairnessDisclosure), atomic Close, provenance meta, and test groups 1–9 each map to a task. Devnet/UI intentionally excluded (out of scope).
- **Roll-at-deal-price** enforced in `computeClearing` and asserted (7.2, 5).
- **Units = PSA price**, not valuation NAV: `IssuanceBasis.ValidateIssuance` checks `psaPrice == clearing × reconciledNav`; units come from clearing result, gated on the basis (5.2, 7.3).
- **Default-to-sell without LP signature** via `AcceptedParticipation` created pre-deadline (3.3, 8.2).
- **Type consistency:** `RegistryHolding`/`mint`/`InstrumentId`/`computeClearing`/`ClearingResult` field names are used identically across tasks.

## Known-risk follow-ups (resolve during execution, not blockers to starting)

- **Interface signatures:** the `interface instance` method names/records in Tasks 1.1 & 7.1 are reconstructed from the docs; Task 0.3 + Spike A validate them against the real DARs — fix against the compiler if any differ.
- **cn-quickstart AllocationRequest:** if `TransferLegRequest` implementation diverges, pull the reference `License.daml` from the cn-quickstart repo for the exact `interface instance AllocationRequest` shape.
- **`admin` party for units/asset:** the plan uses a single `gp`/registry admin; if `Vehicle`/`CashRegistry` are modeled as distinct admin parties, thread the admin through `RegistryHolding`/`TransferLegRequest` (a mechanical change).
