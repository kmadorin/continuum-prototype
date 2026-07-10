// App shell (custody build). The browser holds NO signing key: each role logs in
// with backend credentials, and the CUSTODY BACKEND signs that party's txs under
// policy. Not signed in → the SignIn gate. Signed in → that role's workspace,
// whose actions POST to `/action` (backend signs) and whose reads go through the
// per-party proxy. The topbar shows the logged-in party's CUSTODIAN (institutional
// chrome). Role→view routing lives here; every view reads/writes via `useLedger()`.
import type { ReactNode } from 'react';
import { SessionProvider, useSession, type Role } from './state/WalletSession';
import { ToastProvider } from './state/Toast';
import SignIn from './views/SignIn';
import Advisor from './views/Advisor';
import Buyer from './views/Buyer';
import ExitingLP from './views/ExitingLP';
import RollingLP from './views/RollingLP';
import LPAC from './views/LPAC';
import Settlement from './views/Settlement';
import TrustPanel from './views/TrustPanel';
import './styles.css';

// Each seat's human label + the workspace it unlocks.
const SEATS: Record<Role, { label: string; view: () => ReactNode }> = {
  gp: { label: 'Advisor', view: () => <Advisor /> },
  buyer: { label: 'Secondary Buyer', view: () => <Buyer /> },
  lpExiting: { label: 'Exiting LP', view: () => <ExitingLP /> },
  lpRolling: { label: 'Rolling LP', view: () => <RollingLP /> },
  lpac: { label: 'LPAC Oversight', view: () => <LPAC /> },
};

function Gate() {
  const { isSignedIn, role, custodianName, ready, signOut } = useSession();

  // Wait for the initial /me restore + registry load so a reload doesn't flash the
  // SignIn screen for an already-authenticated session.
  if (!ready) {
    return (
      <div className="portal-wrap">
        <p className="hint">Restoring session…</p>
      </div>
    );
  }

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
        {custodianName ? (
          <span className="custodian-badge" title="Signing custodian">
            <span className="custodian-dot" aria-hidden="true" />
            {custodianName}
          </span>
        ) : null}
        <span className="view-label">{seat.label}</span>
        <button type="button" className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="portal-wrap">{seat.view()}</main>

      {/* Overlays the workspace with a full-screen SETTLED takeover once this
          party's own projection sees the atomic close. */}
      <Settlement />
      <TrustPanel />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </ToastProvider>
  );
}
