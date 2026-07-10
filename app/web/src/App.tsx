// App shell (real-wallet build). The app is a per-tab login gate: each role signs
// into ONE tab with its own Canton external-party wallet, and that tab is locked
// to that role for the whole session. The demo opens SEPARATE tabs, one per role.
//
// Not signed in → the SignIn gate. Signed in → that role's real workspace (Task
// 7), which drives its OWN on-ledger actions by signing with the logged-in role's
// wallet key. The role→view routing lives here; every view reads/writes through
// `useLedger()` (session-signed submitSigned + per-party ACS reads).
import type { ReactNode } from 'react';
import { walletClient } from './lib/useLedger';
import { WalletSessionProvider, useSession, type Role } from './state/WalletSession';
import SignIn from './views/SignIn';
import Advisor from './views/Advisor';
import Buyer from './views/Buyer';
import ExitingLP from './views/ExitingLP';
import RollingLP from './views/RollingLP';
import LPAC from './views/LPAC';
import './styles.css';

// Each seat's human label + the workspace it unlocks. One tab = one role.
const SEATS: Record<Role, { label: string; view: () => ReactNode }> = {
  gp: { label: 'Advisor', view: () => <Advisor /> },
  buyer: { label: 'Secondary Buyer', view: () => <Buyer /> },
  lpExiting: { label: 'Exiting LP', view: () => <ExitingLP /> },
  lpRolling: { label: 'Rolling LP', view: () => <RollingLP /> },
  lpac: { label: 'LPAC Oversight', view: () => <LPAC /> },
};

function Gate() {
  const { isSignedIn, role, signOut } = useSession();

  if (!isSignedIn || !role) return <SignIn />;

  const seat = SEATS[role];
  return (
    <div className="stack g4">
      <header className="topbar">
        <span className="wordmark">
          Continuum<span className="dot">.</span>
        </span>
        <span className="deal-badge">Confidential closing room</span>
        <span className="spacer" />
        <span className="view-label">{seat.label}</span>
        <button type="button" className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="portal-wrap">{seat.view()}</main>
    </div>
  );
}

export default function App() {
  return (
    <WalletSessionProvider onboarder={walletClient}>
      <Gate />
    </WalletSessionProvider>
  );
}
