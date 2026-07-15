import { describe, it, expect } from 'vitest';
import { MOCK_PARTIES, ROLES, mockTenantRecords, mockFingerprint, DEMO_PASSWORD } from './fixtures';

describe('MOCK_PARTIES', () => {
  it('covers all six roles', () => {
    expect(Object.keys(MOCK_PARTIES).sort()).toEqual([...ROLES].sort());
  });

  it('every party id is Canton-shaped (hint::1220+64hex) and deterministic', () => {
    for (const role of ROLES) {
      expect(MOCK_PARTIES[role]).toMatch(new RegExp(`^continuum-${role}-mock::1220[0-9a-f]{64}$`));
    }
  });

  it('party ids are distinct across roles', () => {
    expect(new Set(Object.values(MOCK_PARTIES)).size).toBe(ROLES.length);
  });
});

describe('mockTenantRecords', () => {
  it('produces one record per role with the canonical party id', () => {
    const recs = mockTenantRecords();
    expect(recs).toHaveLength(ROLES.length);
    expect(recs.find((r) => r.role === 'gp')!.party).toBe(MOCK_PARTIES.gp);
  });

  it('carries a human custodian name per role', () => {
    const gp = mockTenantRecords().find((r) => r.role === 'gp')!;
    expect(gp.custodianName).toMatch(/Fireblocks/);
  });

  it('uses the documented demo credentials', () => {
    const gp = mockTenantRecords().find((r) => r.role === 'gp')!;
    expect(gp.username).toBe('gp');
    expect(gp.password).toBe(DEMO_PASSWORD('gp'));
  });

  it('gives every tenant a distinct mnemonic and a Canton-shaped fingerprint', () => {
    const recs = mockTenantRecords();
    expect(new Set(recs.map((r) => r.mnemonic)).size).toBe(recs.length);
    for (const r of recs) expect(r.fingerprint).toMatch(/^1220[0-9a-f]{64}$/);
  });

  it('tenant party matches the fingerprint embedded in its own party id (self-consistent)', () => {
    for (const r of mockTenantRecords()) {
      expect(r.party.endsWith(`::${r.fingerprint}`)).toBe(true);
    }
  });
});

describe('mockFingerprint', () => {
  it('is deterministic and key-derived', () => {
    expect(mockFingerprint(new Uint8Array([1, 2, 3]))).toBe(mockFingerprint(new Uint8Array([1, 2, 3])));
    expect(mockFingerprint(new Uint8Array([1, 2, 3]))).not.toBe(mockFingerprint(new Uint8Array([4, 5, 6])));
  });
});
