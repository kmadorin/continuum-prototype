# Continuum Real-Wallet Role Portal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the real-wallet role portal: 5 external-party wallets each signing their own txs, the ~16-tx single-signer close, portal design, per-role login, the same-update-id money shot — on devnet.

**Architecture:** See `docs/superpowers/specs/2026-07-10-continuum-wallet-portal-spec.md`. Keep the working proxy + `HttpLedgerClient` + hosting; ADD external-party wallet signing + a Daml propose-accept delta + a portal-design role-gated UI.

**Tech:** TS, Node 22, `@noble/ed25519` (browser signing), Vite/React, Daml SDK 3.4.11/dpm. All wallet mechanics are proven — `docs/wallet-auth-spike-RESULT.md`.

**Branch:** `integration` (has Streams A–C). Do NOT push. Commit per task.

---

## Phase 1 — Daml delta + redeploy (blocker; do first)

### Task 1: Add propose-accept wrappers + lpac consent (TDD via Daml Script)

**Files:** Modify `continuum-daml/contracts/daml/Continuum/{Registry,Participation,Deal}.daml`; add tests in `continuum-daml/tests/`.

- [ ] **Step 1: Write failing Daml Script tests** — (a) `ExecDelegationProposal` created by gp, `EDP_Accept` by buyer alone yields `ExecDelegation(gp,buyer)`; (b) `OldFundInterestOffer` by oldFund, `OFI_Accept` by lp yields `OldFundInterest`; (c) `RecordConsent` now requires `lpac` (fails as gp). Run `~/.local/bin/dpm test` → FAIL (templates/controller absent).
- [ ] **Step 2: Add the templates** exactly as spec §3 (`ExecDelegationProposal`, `OldFundInterestOffer`); recontrol `Deal.RecordConsent` to `controller lpac`, add `lpac` observer.
- [ ] **Step 3: Bump package version** in `contracts/daml.yaml` (`1.0.0` → `1.1.0`) — vetting rejects same-name/same-version different-hash.
- [ ] **Step 4:** `~/.local/bin/dpm build --all` then `~/.local/bin/dpm test` → PASS. Confirm existing 41 tests still green (the close path via multi-actAs still works for the headless reference).
- [ ] **Step 5: Commit** `feat(daml): propose-accept wrappers (ExecDelegationProposal/OldFundInterestOffer) + lpac-controlled RecordConsent; bump to 1.1.0`.

### Task 2: Redeploy the new DAR to devnet

- [ ] **Step 1:** Refresh M2M token. `POST /v2/dars/validate` with `contracts/.daml/dist/continuum-contracts-1.1.0.dar` → 200.
- [ ] **Step 2:** `POST /v2/dars` (upload) → 200. Confirm `#continuum-contracts:...` now resolves to 1.1.0 templates via a create of `ExecDelegationProposal`.
- [ ] **Step 3:** Update `docs/devnet-deploy-test-RESULT.md` with the 1.1.0 redeploy note. **Commit** `chore(devnet): redeploy continuum-contracts 1.1.0`.

---

## Phase 2 — WalletClient + headless 16-tx real-signer close (proves the flow before UI)

### Task 3: WalletClient module (TDD) — external-party onboard + prepare/sign/execute

**Files:** Create `app/ledger-client/src/wallet.ts`, `app/ledger-client/src/ed25519.ts`; Test `app/ledger-client/test/wallet.test.ts`. Port from `scratchpad/wallet-spike.mjs` (proven).

- [ ] **Step 1: Write failing tests** — (a) `deriveKey(mnemonic)` is deterministic + round-trips sign/verify; (b) `signHash(key, b64)` matches a known Ed25519 vector; (c) `WalletClient.onboard(hint)` posts generate-topology then allocate with the right body shape (mock fetch); (d) `WalletClient.submitSigned(party, cmds, disclosed?)` does prepare→sign→execute with `packageIdSelectionPreference:[]`, `deduplicationPeriod:{Empty:{}}`, echoes `hashingSchemeVersion`. Run vitest → FAIL.
- [ ] **Step 2: Implement `ed25519.ts`** — BIP-39 mnemonic → Ed25519 key (`@noble/ed25519` + `@scure/bip39`); `pubDerSpki(key)`, `signHash(key, b64hash)` (pure Ed25519 over decoded bytes).
- [ ] **Step 3: Implement `wallet.ts`** — `onboard()` (generate-topology → sign multiHash → allocate), `submitSigned()` (prepare → sign preparedTransactionHash → execute), each producing the exact SIG object from the recipe. Reuse `HttpLedgerClient` for reads/proxy base.
- [ ] **Step 4:** vitest → PASS. **Commit** `feat(wallet): external-party onboard + prepare/sign/execute WalletClient`.

### Task 4: Headless real-signer close (extend close-minimal to 5 external wallets)

**Files:** Create `app/scripts/close-wallets.ts` (from `close-minimal.ts` + `WalletClient`).

- [ ] **Step 1:** Onboard 5 external parties (gp, buyer, lpExiting, lpRolling, lpac), each own key; write `party-registry.json` with their party ids + (dev-only) mnemonics.
- [ ] **Step 2:** Drive the full §4 sequence — each tx signed by the correct wallet: gp deal/setclearing; buyer bid; LPs elections; lpac Grant; the propose-accept pairs (`EDP_Accept` by buyer/lp, `OFI_Accept` by lp); gp allocate legs; gp `Close`.
- [ ] **Step 3: Run live on devnet.** Assert: one `Close` updateId; `SettlementReceipt` on-ledger; buyer holds CV units, exiting LP holds USDC; every authority contract was created by a real per-party signature (log each `updateId`). This is the whole thesis proven headless.
- [ ] **Step 4:** Append the working sequence to `docs/wallet-auth-spike-RESULT.md`. **Commit** `feat(scripts): full 5-wallet single-signer close on devnet`.

---

## Phase 3 — Frontend re-port (portal design + per-role login + money shot)

### Task 5: Portal design system + fonts into app/web
- [ ] Copy `portal/shared/styles.css` → `app/web/src/styles.css`; add Archivo + IBM Plex Mono (self-hosted or `<link>`); port portal chrome (topbar, wordmark, sign-in shell). Verify against continuum-portal.pages.dev visually. **Commit**.

### Task 6: Per-role login + wallet session (TDD the session gate)
**Files:** `app/web/src/state/WalletSession.tsx`, `app/web/src/views/SignIn.tsx`.
- [ ] **Step 1:** Failing test — session locks a tab to one `{role, party}`; a second role in the same tab is refused; `sessionStorage`-backed (per-tab).
- [ ] **Step 2:** Implement sign-in: pick role → enter/generate mnemonic → derive key → `WalletClient.onboard` (or restore existing party) → store `{role, party}` + in-memory key in `sessionStorage`. Test → PASS. **Commit**.

### Task 7: Role-gated views (portal design, only own sections/actions)
**Files:** `app/web/src/views/{Advisor,Buyer,ExitingLP,RollingLP,LPAC}.tsx`.
- [ ] Each view renders only that role's sections/actions (`docs/contract-ui-role-map.md`), signs via `WalletClient.submitSigned`. Advisor: deal/setclearing/consent-record/close. Buyer: sealed bid. LPs: election + `EDP_Accept`/`OFI_Accept`. LPAC: `Grant`. Drive against devnet. **Commit** per view.

### Task 8: Money-shot — per-window SETTLED at shared update id
**Files:** `app/web/src/views/Settlement.tsx`.
- [ ] Each window polls (1s) its own party ACS/updates; on Close, render full-screen SETTLED showing the shared `updateId`. Test 5 tiled windows: GP fires Close, all flip with the same id. Add the footer trust-model panel. **Commit**.

---

## Phase 4 — Converge, host, submit

### Task 9: Host + full live demo
- [ ] Point web at the CF Worker proxy; onboard the 5 wallets on devnet; run the whole deal through 5 tiled windows end-to-end; capture the same-update-id screenshot. **Commit**.

### Task 10: Submission package
- [ ] Public repo (**fresh-seed** from scrubbed tree; `gitleaks` gate — see the superseded Stream-C plan Task 4), deck, 3-min video (frame → bids → private elections → 5-window atomic close at one update id → oversight), live-product URL. Rotate the 5N secret post-event.

---

## Cut-line (from the bottom)
Keep: Daml delta + redeploy, WalletClient, headless 5-wallet close, ≥buyer+gp real-wallet UI, money shot, hosted URL, repo/deck/video. Cut first: `OldFundInterestOffer` (keep multi-actAs for OFI as "pre-existing fund records"), rolling-LP as a 5th window, WS (use polling). NEVER cut: real per-role signing of the visible economic actions + the atomic close on devnet.

## Self-review
- Spec §2 auth → Tasks 3–4,6; §3 Daml → Tasks 1–2; §4 flow → Task 4 (headless) then Tasks 7 (UI); §5 design → Tasks 5–8. Wallet mechanics all pre-proven (`wallet-auth-spike-RESULT.md`). R1 (browser Ed25519) retired in Task 3 step 2; R4 (orchestration) retired headless in Task 4 before any UI.
