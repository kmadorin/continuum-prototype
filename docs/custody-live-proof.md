# Custody app — proven live end-to-end on devnet ✅

**Date:** 2026-07-11 · Booted the custody backend (`app/custody/server.ts`, port 8787, serving the built
SPA) against the shared 5N devnet validator and drove the full custody path with real per-role logins.

## What was verified live (real transactions on devnet)
| Check | Result |
|---|---|
| Backend boot | 5 custodian tenants loaded (gp/buyer/lpExiting/lpRolling/lpac); serves the Vite SPA (`GET /` → 200) |
| `GET /registry` | returns the 5 public party ids + custodian names |
| `POST /auth/login` (per role) | httpOnly session cookie; returns `{role, party, custodianName}` |
| `POST /action` (gp) | backend signed with **gp's own key** → real `updateId 1220d8b2…` committed on devnet |
| **Enforcement** | gp session attempting `actAs: [buyer]` → **HTTP 403**, refused + audited |
| Party-scoped reads | buyer's `/api/v2/state/active-contracts` returns only buyer's projection (proxy forces the party filter) |
| **Cross-role propose→accept** | Fireblocks(gp) creates `ExecDelegationProposal{party=buyer}` → buyer reads it in its own ACS → Copper(buyer) signs `EDP_Accept` → `ExecDelegation` created |
| Audit trail | per-custodian entries: signed actions (custodian, key fingerprint, action, updateId) + the refused attempt as `failed` |
| Ledger Inspector | `GET /ledger/update/:id` returns the real committed transaction tree (updateId, effectiveAt, CreatedEvent w/ contractId + templateId) |

## Why this proves the product
Each role logs in, reads its OWN on-chain state, and **its custodian signs its OWN transactions with that
party's key** — the full 34-tx close (proven headless in `close-wallets.ts`) is exactly this pattern repeated,
now through the custody HTTP stack. Every party's authorization is a distinct Ed25519 signature verified by the
Canton synchronizer; the operator (proxy/M2M) cannot forge a party's approval. The demo colocates 5 custodians
in one backend; the protocol is already multi-custodian (keys move to Fireblocks/Copper/a bank custodian
unchanged).

## Run locally
```
cd app/web && npm run build            # → web/dist (backend serves it)
cd ../ && npx tsx custody/server.ts    # :8787, needs app/.env FN_SECRET + gitignored custody-keys.json
# open http://localhost:8787 → sign in (gp/gp-demo, buyer/buyer-demo, lpExiting/lpExiting-demo,
#   lpRolling/lpRolling-demo, lpac/lpac-demo)
```
