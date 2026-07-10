// app/proxy/src/token.ts
type Cfg = { authUrl: string; secret: string };
export class TokenManager {
  private token?: string;
  private expiresAt = 0;
  constructor(private cfg: Cfg, private fetchImpl: typeof fetch = fetch) {}
  async get(force = false): Promise<string> {
    const now = Date.now();
    if (!force && this.token && now < this.expiresAt - 60_000) return this.token;
    const body = new URLSearchParams({
      grant_type: 'client_credentials', client_id: 'validator-devnet-m2m',
      client_secret: this.cfg.secret, audience: 'validator-devnet-m2m', scope: 'daml_ledger_api',
    }).toString();
    const res = await this.fetchImpl(this.cfg.authUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (!res.ok) throw new Error(`token exchange failed: ${res.status}`);
    const j: any = await res.json();
    this.token = j.access_token;
    this.expiresAt = Date.now() + (j.expires_in ?? 28800) * 1000;
    return this.token!;
  }
}
