// portal/leaving.html — "Investor — Exiting". Elect Sell: the LP's full
// positionNav goes into sellNav, 0 into rollNav (Continuum.Election:LPElection
// has no Roll/Sell enum — see LPElectionView in shared.tsx).
import type { LedgerClient } from '../../../ledger-client/src/types';
import { useParty } from '../state/PartyContext';
import { LPElectionView } from './shared';

// Demo-only figure: there is no RegistryHolding/position contract builder yet,
// so the exiting LP's NAV position is a fixed illustrative constant.
const POSITION_NAV = '18000000.0';

export default function ExitingLP({ client }: { client: LedgerClient }) {
  const { current } = useParty();
  return (
    <LPElectionView
      client={client}
      lpParty={current}
      intent="sell"
      personLabel="Investor — Leaving"
      positionNav={POSITION_NAV}
    />
  );
}
