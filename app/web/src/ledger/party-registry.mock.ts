// Mock party registry for the Stream-B frontend (mock-first, per plan Task 4).
//
// This is a stand-in for the real `party-registry.json` that Stream A emits at
// devnet/convergence — same shape (`Registry`), loaded through the same
// `loadRegistry` validator so a swap at convergence is a one-line import
// change, not a rewrite. NEVER hard-code a party string in a component —
// always go through `partyRegistry.parties.<name>`.
import { loadRegistry } from './registry';

export const partyRegistry = loadRegistry({
  namespace: 'continuum-demo',
  synchronizerId: 'continuum-demo::MOCK',
  packageName: 'continuum-contracts',
  parties: {
    gp: 'continuum-gp-demo::MOCK',
    vehicle: 'continuum-vehicle-demo::MOCK',
    buyer: 'continuum-buyer-demo::MOCK',
    // A second buyer exists purely so Buyer.tsx can demonstrate peer-blindness:
    // it queries this party's ACS and shows the current buyer's bid is absent.
    buyer2: 'continuum-buyer2-demo::MOCK',
    lp: 'continuum-lp-demo::MOCK', // ExitingLP
    lp2: 'continuum-lp2-demo::MOCK', // RollingLP
    lpac: 'continuum-lpac-demo::MOCK', // Oversight
  },
});
