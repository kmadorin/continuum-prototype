import { describe, it, expect } from 'vitest';
import { loadRegistry } from './registry';
describe('registry', () => {
  it('exposes namespaced party IDs, never bare hints', () => {
    const r = loadRegistry({ namespace: 'NS', synchronizerId: 'global-domain::x', packageName: 'continuum-contracts',
      parties: { gp: 'continuum-gp-demo::NS', buyer: 'continuum-buyer-demo::NS', lp: 'continuum-lp-demo::NS', lpac: 'x::NS', vehicle: 'y::NS' } });
    expect(r.parties.gp).toContain('::');
    expect(r.packageName).toBe('continuum-contracts');
  });
  it('rejects a registry with a bare (non-namespaced) party', () => {
    expect(() => loadRegistry({ namespace: 'NS', synchronizerId: 's', packageName: 'p',
      parties: { gp: 'continuum-gp-demo' } as any })).toThrow();
  });
});
