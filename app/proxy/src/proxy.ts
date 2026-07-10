// app/proxy/src/proxy.ts
type Req = { method: string; path: string; body: string };
type Opts = { ledgerUrl: string; tm: { get(f?: boolean): Promise<string> }; fetchImpl?: any };
const CORS = { 'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };
export async function handleProxy(req: Req, o: Opts) {
  // SECURITY: this injects a privileged M2M bearer server-side and allows any origin.
  // It is a local devnet demo relay, NOT a hardened gateway. Only forward the ledger
  // API surface — reject anything outside `/v2/` so it can't be steered elsewhere.
  if (!req.path.startsWith('/v2/')) {
    return { status: 404, body: '{"error":"only /v2/* is proxied"}', headers: { ...CORS } };
  }
  const f = o.fetchImpl ?? fetch;
  const call = async (tok: string) => f(`${o.ledgerUrl}${req.path}`, {
    method: req.method,
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: req.method === 'GET' ? undefined : req.body });
  let up = await call(await o.tm.get());
  if (up.status === 401) up = await call(await o.tm.get(true));
  return { status: up.status, body: await up.text(), headers: { ...CORS } };
}
