// app/proxy/src/server.ts  (Node dev server; the Worker variant reuses handleProxy)
import { createServer } from 'node:http';
import { TokenManager } from './token';
import { handleProxy } from './proxy';
const tm = new TokenManager({ authUrl: process.env.FN_AUTH_URL!, secret: process.env.FN_SECRET! });
const ledgerUrl = process.env.FN_LEDGER_URL!;
createServer(async (r, w) => {
  if (r.method === 'OPTIONS') { w.writeHead(204, { 'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' }); return w.end(); }
  const chunks: Buffer[] = []; for await (const c of r) chunks.push(c as Buffer);
  const res = await handleProxy({ method: r.method!, path: r.url!, body: Buffer.concat(chunks).toString() }, { ledgerUrl, tm });
  w.writeHead(res.status, { 'Content-Type': 'application/json', ...res.headers }); w.end(res.body);
}).listen(8788, () => console.log('proxy on :8788'));
