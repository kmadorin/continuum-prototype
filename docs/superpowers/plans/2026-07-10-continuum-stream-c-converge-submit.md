# Continuum Stream C (convergence + submission) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Point Stream B's UI at Stream A's real proxy + `party-registry.json`, run one full deal on devnet through the UI, verify conservation on-ledger, then ship the FLOOR submission: public repo (secret gitignored), hosted live product, deck, 3-min video.

**Architecture:** No new components — wire A→B and host. The live-product link + on-ledger devnet contracts are the two HARD hackathon bars; both are satisfied here.

**Runs AFTER:** Stream A Tasks 1–6 (proxy + client + seed + registry) and Stream B Tasks 1–5 (views on the mock). Stream A Task 7 (atomic Close) can land in parallel and is required for the "close" step of the full run.

---

## Task 1: Swap mock → real client, run one live lifecycle through the UI

**Files:**
- Modify: `app/web/src/App.tsx` (inject `HttpLedgerClient('/api')` instead of `MockLedgerClient`)
- Create: `app/web/vite.config.ts` proxy rule `/api` → `http://localhost:8788` (dev)
- Create: `app/web/src/party-registry.json` (symlink/copy of `app/party-registry.json` from Stream A seed)

- [ ] **Step 1:** Add Vite dev proxy so the browser hits the reverse-proxy without CORS pain in dev:

```ts
// app/web/vite.config.ts — server.proxy
export default { plugins: [/* react */], server: { proxy: { '/api': { target: 'http://localhost:8788', rewrite: (p: string) => p.replace(/^\/api/, '') } } } };
```

- [ ] **Step 2:** In `App.tsx`, swap the injected client:

```tsx
import { HttpLedgerClient } from '../../ledger-client/src/client';
import registry from './party-registry.json';
const client = new HttpLedgerClient('/api');
// <PartyProvider personas={registry.parties}> ... pass `client` to views
```

- [ ] **Step 3:** Boot all three (proxy, seed, web) and run the full deal through the UI:

Run: proxy on :8788 (Stream A T3) → `node scripts/seed.ts` (writes registry) → `cd web && npm run dev`.
Then click: Advisor open room → Buyer sealed bid → Advisor set price + consent + open elections → Exiting LP sell → (Rolling LP roll, target) → Advisor **Close** → Oversight verify.
Expected: each action returns a real `updateId`; PrivacyProof view shows the sealed bid/election present in one column, absent in peers' — LIVE on devnet.

- [ ] **Step 4:** Reconcile any field-name mismatches surfaced (the deferred `SealedBid`/`LPElection`/`ContinuationDeal` `with`-block fields) against the Daml; fix `ops.ts`; re-run.

- [ ] **Step 5: Commit**

```bash
git add app/web/vite.config.ts app/web/src/App.tsx
git commit -m "feat(web): wire UI to real devnet ledger via reverse-proxy"
```

---

## Task 2: Verify conservation on-ledger

- [ ] **Step 1:** After a full close, query final holdings for each party and assert the on-chain-spec §5 invariants hold on devnet (buyer cash out == exiting-LP cash in; units issued == PSA price / navPerUnit; asset owner moved). Reuse `close-minimal.ts` assertions.

Run: `cd app && node --env-file=.env --experimental-strip-types scripts/close-minimal.ts` (or the UI-driven equivalent) → confirm balances.
Expected: conservation holds; a `SettlementReceipt` exists on devnet.

- [ ] **Step 2:** Screenshot the event tree / before-after balances for the deck + video.

---

## Task 3: Host the live product (FLOOR — the live-product link is mandatory)

**Files:**
- Create: `app/proxy/wrangler.jsonc` (Cloudflare Worker variant of `handleProxy`) OR a Vercel/Netlify serverless function.
- Create: hosting config for the Vite build.

> Repo already has `.wrangler/` → Cloudflare is the path of least resistance: Worker hosts the proxy (secret as a Worker secret, NOT in code), Cloudflare Pages hosts the Vite build.

- [ ] **Step 1:** Wrap `handleProxy` in a Worker `fetch` handler; set the secret via `wrangler secret put FN_SECRET`. Verify `GET /v2/state/ledger-end` through the deployed Worker returns an offset.

- [ ] **Step 2:** `npm run build` the web app; deploy to Cloudflare Pages (or Netlify/Vercel); set the app's `/api` base to the deployed Worker URL.

- [ ] **Step 3:** Open the hosted URL in a clean browser, run the demo flow end-to-end against devnet. THIS URL is the submission's "live product link."

Expected: a public URL where a judge clicks through the deal on real devnet. Confirm the secret is NOT in any client bundle (`grep -r r69FQ dist/` → no matches).

- [ ] **Step 4: Commit**

```bash
git add app/proxy/wrangler.jsonc app/web/... 
git commit -m "chore(deploy): host reverse-proxy (Worker) + web (Pages); live-product link live"
```

---

## Task 4: Submission package (public repo, deck, 3-min video)

- [ ] **Step 1: Repo hygiene for PUBLIC release** — final scan: `git log -p | grep -i <REDACTED-SECRET-FRAGMENT>` returns NOTHING; `.env`, `party-registry.json` gitignored; `.env.example` present. Add a top-level `README.md`: what Continuum is, the devnet deploy proof (`docs/devnet-deploy-test-RESULT.md`), how to run (proxy + seed + web), the live-product URL.

- [ ] **Step 2: Deck** — 8–10 slides: problem (continuation-fund close takes weeks of lawyers/wires), solution (private atomic on-ledger close), the ILPA governance story, the Canton-essential properties (projection privacy / atomic multilateral settlement / selective disclosure), the live devnet proof + screenshots, team.

- [ ] **Step 3: 3-min video** — mirror `prototype/demo-script.md`: frame it → set up room → sealed bid → private elections → **PrivacyProof (the money shot)** → **Close all-at-once on devnet** → all-or-nothing failure beat → oversight. Show the hosted URL + a live `updateId`/ACS query proving it's real devnet.

- [ ] **Step 4:** Assemble the submission checklist: (1) public repo URL, (2) deck, (3) 3-min video, (4) live-product URL, (5) devnet deploy proof. Submit before Mon 13 Jul 12:59 BST.

---

## Cut-line (if time runs short — cut from the bottom up)
1. Keep: floor lifecycle + PrivacyProof + minimal Close on devnet + hosted URL + repo/deck/video. **This qualifies.**
2. Cut first: RollingLP second persona, multi-buyer scaling, WebSocket live updates, waterfall viz, deal-#2 flywheel, Splice cash leg.
3. NEVER cut: the hosted live-product link or on-ledger devnet contracts — those are the two mandatory bars.
