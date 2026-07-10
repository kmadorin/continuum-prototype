import { describe, it, expect, vi } from 'vitest';
import { TokenManager } from '../../proxy/src/token';

const fakeJwt = 'h.e.s';
function fetchStub(expiresIn = 28800) {
  return vi.fn(async () => ({ ok: true, json: async () => ({ access_token: fakeJwt, expires_in: expiresIn }) })) as any;
}

describe('TokenManager', () => {
  it('fetches once and caches until near expiry', async () => {
    const f = fetchStub();
    const tm = new TokenManager({ authUrl: 'x', secret: 's' }, f);
    expect(await tm.get()).toBe(fakeJwt);
    expect(await tm.get()).toBe(fakeJwt);
    expect(f).toHaveBeenCalledTimes(1);
  });
  it('refreshes when forced', async () => {
    const f = fetchStub();
    const tm = new TokenManager({ authUrl: 'x', secret: 's' }, f);
    await tm.get(); await tm.get(true);
    expect(f).toHaveBeenCalledTimes(2);
  });
  it('sends the correct client_credentials body', async () => {
    const f = fetchStub();
    const tm = new TokenManager({ authUrl: 'A', secret: 'SEK' }, f);
    await tm.get();
    const body = (f.mock.calls[0][1] as any).body as string;
    expect(body).toContain('grant_type=client_credentials');
    expect(body).toContain('client_id=validator-devnet-m2m');
    expect(body).toContain('audience=validator-devnet-m2m');
    expect(body).toContain('scope=daml_ledger_api');
    expect(body).toContain('SEK');
  });
});
