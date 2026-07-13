# Continuum — web

React 19 + Vite + TS. Role-scoped UI over the custody backend: the GP gets the full lifecycle
Deal Page, every narrow seat gets a focused single-purpose screen. The browser holds no key —
each seat logs in and the custody spine signs on its behalf.

## Running

```bash
npm install
npm run dev:sandbox     # UI work — everything local, nothing shared, no secrets
npm run dev             # against a real custody spine (see below)
npm test                # vitest
npm run build           # tsc -b && vite build
```

### `dev:sandbox` — the default for UI work

The **real** custody backend (`app/custody/app.ts`) runs inside the Vite dev server over an
**in-memory ledger** (`sandbox/`). No devnet, no keys, no shared state.

- Log in as any seat: `gp`, `buyer`, `lpExiting`, `lpRolling`, `lpac`, `valuer` — password
  `<role>-demo`. Open several browser profiles to drive several seats at once.
- Click the deal all the way to `Closed`, then hit **Reset demo** on the sign-in page (or restart
  the dev server) and start over. Nothing you do can corrupt anything.
- Sessions, the sign-only-your-own-party rule, the audit trail, the anchored-document `/verify`
  (real sha256 over the real files) and the demo-epoch reset are all the **production code path** —
  only the ledger is swapped.

The fake ledger reproduces Canton's **privacy projection** (a sealed bid is blind to the GP and to
peer bidders; an LP's election is blind to everyone but that LP; the fairness disclosure reaches
the LPAC, not the room), the **controllers** (a seat cannot exercise a choice it does not control),
and the **atomic close** (the antecedent-DAG gate, unit conservation against the PSA price,
all-or-nothing on failure). `sandbox/sandbox.test.ts` holds that line.

It is **not** the contracts. Real authorization comes from real signatures against a real
synchronizer; a green sandbox run says the UI wiring is right, never that the contracts are. That
is what the Daml tests and the devnet close are for.

### `dev` — against a real spine

Proxies every backend route to a running custody spine. Defaults to the deployed one
(`https://continuum-custody.fly.dev`) so no secrets are needed; point it at a local spine with
`CUSTODY_URL=http://localhost:8787 npm run dev`.

⚠️ The deployed spine is the **live demo on devnet, shared with everyone**. Reads are free, but any
action (bid, election, `Close`) really writes to that deal. Use `dev:sandbox` unless you
specifically need live devnet data.
