import { describe, it, expect, vi } from 'vitest';
import { handleProxy } from '../../proxy/src/proxy';

describe('handleProxy', () => {
  it('injects bearer, forwards path/body to ledger, returns response', async () => {
    const upstream = vi.fn(async () => ({ status: 200, headers: new Map(),
      text: async () => '{"offset":42}' })) as any;
    const tm = { get: async () => 'TOK' } as any;
    const req = { method: 'POST', path: '/v2/state/active-contracts', body: '{"x":1}' };
    const res = await handleProxy(req, { ledgerUrl: 'https://L', tm, fetchImpl: upstream });
    expect(res.status).toBe(200);
    expect(res.body).toBe('{"offset":42}');
    const [url, init] = upstream.mock.calls[0];
    expect(url).toBe('https://L/v2/state/active-contracts');
    expect((init.headers as any).Authorization).toBe('Bearer TOK');
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
  it('refreshes token once on 401 then retries', async () => {
    let n = 0;
    const upstream = vi.fn(async () => (++n === 1
      ? { status: 401, headers: new Map(), text: async () => 'expired' }
      : { status: 200, headers: new Map(), text: async () => 'ok' })) as any;
    const tm = { get: vi.fn(async () => 'TOK') } as any;
    const res = await handleProxy({ method: 'GET', path: '/v2/state/ledger-end', body: '' },
      { ledgerUrl: 'https://L', tm, fetchImpl: upstream });
    expect(res.status).toBe(200);
    expect(tm.get).toHaveBeenCalledWith(true); // forced refresh
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it('rejects non-/v2 paths without touching the ledger', async () => {
    const upstream = vi.fn() as any;
    const tm = { get: vi.fn(async () => 'TOK') } as any;
    const res = await handleProxy({ method: 'GET', path: '/admin/secrets', body: '' },
      { ledgerUrl: 'https://L', tm, fetchImpl: upstream });
    expect(res.status).toBe(404);
    expect(upstream).not.toHaveBeenCalled();
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
  });
});
