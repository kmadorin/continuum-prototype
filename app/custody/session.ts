// app/custody/session.ts
// Signed session token (HMAC-SHA256 over a base64url JSON payload). The cookie is
// set httpOnly by the server; this module only mints/verifies the value. NEVER put
// key material in the payload — only the identity binding the browser is allowed to see.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type SessionData = {
  username: string;
  tenant: string;
  role: string;
  party: string;
  custodianName: string;
};

export function signSession(data: SessionData, secret: string): string {
  const payload = Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
  const mac = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${mac}`;
}

export function verifySession(token: string | undefined, secret: string): SessionData | null {
  if (!token) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 0) return null;
  const payload = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionData;
  } catch {
    return null;
  }
}
