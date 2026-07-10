// portal/staying.html — "Investor — Rolling". Elect Roll: the LP's full
// positionNav goes into rollNav, 0 into sellNav (Continuum.Election:LPElection
// has no Roll/Sell enum — see LPElectionView in shared.tsx).
import type { LedgerClient } from '../../../ledger-client/src/types';
import { useParty } from '../state/PartyContext';
import { LPElectionView } from './shared';

// Demo-only figure: there is no RegistryHolding/position contract builder yet,
// so the rolling LP's NAV position is a fixed illustrative constant.
const POSITION_NAV = '14000000.0';

export default function RollingLP({ client }: { client: LedgerClient }) {
  const { current } = useParty();
  return (
    <LPElectionView
      client={client}
      lpParty={current}
      intent="roll"
      personLabel="Investor — Staying"
      positionNav={POSITION_NAV}
    />
  );
}
