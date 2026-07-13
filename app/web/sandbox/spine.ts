// Sandbox spine — the REAL custody backend (`createApp`) wired to a FAKE ledger.
//
// Nothing about the backend is reimplemented here: sessions, the sign-only-your-own-party
// enforcement, the audit log, the per-party reads proxy, the anchored-document /verify
// (real sha256 over the real files) and the demo-epoch reset all run the production code
// path. Only the three ports that reach devnet are swapped:
//
//   signer   → applies commands to the in-memory ledger instead of submitting to Canton
//   fetchImpl→ answers the JSON Ledger API v2 routes the proxy forwards (ACS, ledger-end,
//              update-by-id) out of the same in-memory ledger
//   reads    → the seed's idempotency check
//
// So the frontend cannot tell the difference, and no key material or devnet access exists.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp, type AuditEntry } from '../../custody/app';
import { FakeLedger } from './ledger';
import { sandboxTenants } from './tenants';

/** Never fetched — the fake fetchImpl matches on the path, not the host. */
const LEDGER_BASE = 'http://ledger.sandbox.invalid';

const here = resolve(fileURLToPath(import.meta.url), '..');
/** The real anchored documents, so /docs and /verify hash the same bytes as production. */
const DOCS_ROOT = resolve(here, '../../custody/docs');

export type Sandbox = {
  /** The Hono app: the production custody spine over the fake ledger. */
  app: ReturnType<typeof createApp>;
  ledger: FakeLedger;
  audit: AuditEntry[];
};

export function createSandbox(): Sandbox {
  const ledger = new FakeLedger();
  const tenants = sandboxTenants();
  const audit: AuditEntry[] = [];

  // The JSON Ledger API v2 surface the custody proxy forwards to. Auth headers are
  // ignored: authorization in the sandbox is the party filter, same as the projection.
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(LEDGER_BASE, '').split('?')[0]!;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const json = (v: unknown, status = 200) =>
      new Response(JSON.stringify(v), { status, headers: { 'Content-Type': 'application/json' } });

    if (path === '/v2/state/ledger-end') return json({ offset: ledger.offset() });

    if (path === '/v2/state/active-contracts') {
      // The spine has already forced the filter to the session party — trust it, as the
      // real ledger does: the party filter IS the privacy projection.
      const party = Object.keys(body?.filter?.filtersByParty ?? {})[0] ?? '';
      return json(ledger.activeContractsRaw(party));
    }

    if (path === '/v2/updates/update-by-id') {
      const party =
        Object.keys(body?.updateFormat?.includeTransactions?.eventFormat?.filtersByParty ?? {})[0] ?? '';
      const tx = ledger.updateById(body?.updateId, party);
      return tx ? json(tx) : json({ error: 'update not found' }, 404);
    }

    return json({ error: `sandbox ledger: unrouted ${path}` }, 404);
  };

  const app = createApp({
    tenants,
    // The session tenant's real key is handed to us and ignored — the fake ledger's
    // authority check is the acting party, which the spine has already pinned to the
    // session. (Signing bytes would prove nothing against an in-memory store.)
    signer: {
      async submitSigned(party, _key, _fingerprint, commands) {
        return { updateId: ledger.submit(party, commands) };
      },
    },
    reads: {
      async activeContracts(party, opts) {
        return ledger.activeContracts(party, opts?.templateId);
      },
    },
    sessionSecret: 'sandbox-session-secret',
    ledgerBase: LEDGER_BASE,
    token: async () => 'sandbox-transport-token',
    fetchImpl,
    audit,
    docsRoot: DOCS_ROOT,
    secureCookie: false,
    seedOnBoot: true,
  });

  return { app, ledger, audit };
}
