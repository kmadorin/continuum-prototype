# Continuum — Custody Backend Spec (institutional custody model)

**Date:** 2026-07-11 · **Status:** Approved (Fable-confirmed; owner decision) → executing
**Supersedes the AUTH MODEL of** `2026-07-10-continuum-wallet-portal-spec.md` (browser wallets → server-side custody).
Everything else there still holds (contracts 1.1.0, propose-accept close, portal design, per-role views, money-shot).
**Grounds:** `docs/wallet-auth-spike-RESULT.md` (proven prepare/sign/execute — now runs server-side).

## 1. Why custodial (not browser wallets)
Institutional participants (pensions, family offices, GPs, secondaries buyers) do NOT self-custody signing
keys — regulation pushes them to qualified custodians / MPC (Fireblocks, Copper, BNY). Canton external-party
signing was designed for exactly this: a custodian holds the key off the participant node and signs under
policy. Custodial is the AUTHENTIC model here, and simpler (no browser key mgmt).

**Still real per-party authorization (the crux):** the backend signs each party's tx with THAT party's own
Ed25519 key → every close leaves 5 distinct signatures the synchronizer verifies; no party is committed
without its key. Categorically different from M2M act-as (zero per-party cryptographic artifact).
**Honest framing:** *"Each party is committed only by its own key's signature, verified by Canton itself; the
demo colocates 5 custodians in one service, but the protocol is already multi-custodian — production moves
those keys to Fireblocks/Copper/a bank custodian without changing a line of settlement code."*

## 2. Architecture
```
Browser (React, NO keys) ──login/cookie──▶  Custody backend (Node/TS, one live URL)
  each role app reacts to                    - /auth/login → session {user, tenant, role, party}
  its own on-chain ACS                        - 5 CUSTODIAN TENANTS, each with its party's Ed25519 key
  (no tab sync)                               - action endpoint: enforce actAs==session.party → sign with
  toasts w/ real updateId                       that party's key (reuse prepare/sign/execute) → submit
  Approval Queue + Ledger Inspector           - Approval Queue (four-eyes): pending → officer Approve&Sign → release
                                              - Audit log: every signature (officer, custodian, key fp, hash, updateId)
                                              - holds M2M transport token server-side; /api reads scoped to session party
                                              - serves the static Vite build (single deploy)
                                                     │ prepare/execute (transport M2M) + signature (party key)
                                                     ▼
                                              5N devnet JSON Ledger API v2 · contracts 1.1.0
```

## 3. Custody backend (Fable's spine — build first)
- **5 custodian tenants** (one per party). Each = {custodianName, role, party, ed25519 key}. Keys loaded from a
  gitignored config (`app/custody-keys.json`, pre-provisioned wallets). Party ids also in public `party-registry.json`.
  Custodian names for the story: e.g. "Northgate Trust — LP custodian", "Fireblocks — GP treasury", etc.
- **Login**: `POST /auth/login {username, password}` → signed session cookie (HMAC, backend secret) binding
  `{userId, tenant, role, party}`. 5 demo users (one per role), creds in gitignored config.
- **Sign endpoint**: `POST /action {commands}` → validate session → **ENFORCE every `actAs` == session.party**
  (else 403) → sign the prepared-tx hash with THAT tenant's key (reuse `ledger-client/src/{ed25519,wallet}`
  server-side) → `executeAndWaitForTransaction` → return `{updateId}`. Non-negotiable: **refuse to sign for a
  party other than the session's**, and **log every signature request** (who/custodian/key-fingerprint/hash/updateId/outcome).
- **Reads proxy**: `GET /api/v2/*` → force the query's party filter to the session party, inject M2M transport
  token, forward. (Real per-party projection; a user cannot read another party's ACS.)
- **Transport token** held server-side (reuse `proxy/src/token.ts` TokenManager); never sent to the browser.

## 4. Approval queue (four-eyes — the pitch highlight)
- A signature request may land as **PENDING** in the target tenant's queue instead of signing immediately.
  `GET /approvals` (session's tenant) lists pending items with the deal terms to review.
- `POST /approvals/:id/approve` (the officer) → releases: signs with the tenant key + submits + audits.
  `POST /approvals/:id/reject` → records rejection. Mirrors Fireblocks policy quorum.
- Which actions go through approval: the counterparty ACCEPTs + the LP/buyer economic decisions (their consent
  is the four-eyes moment). GP's own mechanics can auto-sign. Keep configurable.

## 5. Ledger Inspector (on-chain proof)
- `GET /ledger/update/:updateId` → backend calls `/v2/updates/update-by-id` (as the session party) → returns
  the committed transaction tree. Frontend drawer renders: the signatory parties, contract ids, record time,
  raw ledger JSON. Optionally fetch the same update as another party to show multi-party visibility, and show
  the custody audit-log signature events (key fingerprint + hash) beside it. This is the "not a mock" artifact.

## 6. Audit trail
Per-party audit tab: timestamp, officer identity, custodian, key fingerprint, tx hash, resulting updateId —
reconcilable against the on-ledger record. "Every consent is a court-grade artifact."

## 7. Frontend changes (from the browser-wallet build)
- **SignIn**: username/password (per role) → `POST /auth/login` → session cookie. No mnemonic, no client key.
- **Views**: unchanged in structure; actions now `POST /action {commands}` (backend signs) instead of client
  `submitSigned`. Each role app reacts to its on-chain ACS (event-driven; no tab sync).
- **New**: Approval Queue view, Ledger Inspector drawer, tx toasts (updateId).
- The client `ed25519`/`wallet` modules MOVE server-side; delete their browser usage + the sessionStorage key.

## 8. What we keep (not wasted)
Contracts 1.1.0 + propose-accept close (proven); `close-wallets.ts` orchestration (becomes the backend's
settlement sequence / reference); `ed25519`+`wallet` signing code (relocated server-side); portal design;
role views; money-shot reads; the CF Worker/token plumbing (token mgmt reused).

## 9. Build order (Fable)
1. Custody backend spine: login + 5 tenants + sign-with-your-own-party-key + enforcement + audit + reads proxy + pre-provision keys.
2. Approval queue (backend + officer Approve&Sign UI).
3. Ledger Inspector drawer + tx toasts.
4. Host (single Node deploy serving API + static build) + live 5-user run + submission.

## 10. Security
Per-party keys in gitignored `app/custody-keys.json` (throwaway devnet demo wallets) — NEVER committed
(`.gitignore` blocks `custody-keys*.json` too). Backend never exposes keys or the transport token to the browser.
Session cookie signed + httpOnly. Every signature audited.
