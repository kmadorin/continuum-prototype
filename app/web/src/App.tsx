// App shell (custody build). The browser holds NO signing key: each role logs in
// with backend credentials, and the CUSTODY BACKEND signs that party's txs under
// policy. Not signed in → the SignIn gate. Signed in → that role's workspace,
// whose actions POST to `/action` (backend signs) and whose reads go through the
// per-party proxy. The topbar shows the logged-in party's CUSTODIAN (institutional
// chrome). Role→view routing lives here; every view reads/writes via `useLedger()`.
import { SessionProvider, useSession, type Role } from './state/WalletSession';
import { ToastProvider } from './state/Toast';
import { InspectorProvider } from './state/Inspector';
import DealPage from './views/DealPage';
import SignIn from './views/SignIn';
import Settlement from './views/Settlement';
import TrustPanel from './views/TrustPanel';
import './styles.css';

// Each seat's human label (topbar chrome). Every seat now lands on the same shared
// Deal Page; the role only sets emphasis + which contextual CTA is enabled.
const SEAT_LABEL: Record<Role, string> = {
  gp: 'Advisor',
  buyer: 'Secondary Buyer',
  lpExiting: 'Exiting LP',
  lpRolling: 'Rolling LP',
  lpac: 'LPAC Oversight',
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
        <span className="view-label">{SEAT_LABEL[role]}</span>
        <button type="button" className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="portal-wrap">
        <DealPage />
      </main>

      {/* Overlays the workspace with a full-screen SETTLED takeover once this
          party's own projection sees the atomic close. */}
      <Settlement />
      <TrustPanel />
    </div>
  );
}

export default function App() {
  return (
    <InspectorProvider>
      <ToastProvider>
        <SessionProvider>
          <Gate />
        </SessionProvider>
      </ToastProvider>
    </InspectorProvider>
  );
}
