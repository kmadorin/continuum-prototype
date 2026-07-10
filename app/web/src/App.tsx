// App shell (real-wallet build). The app is a per-tab login gate: each role signs
// into ONE tab with its own Canton external-party wallet, and that tab is locked
// to that role for the whole session. The demo opens SEPARATE tabs, one per role.
//
// Not signed in → the SignIn gate. Signed in → that role's workspace. The real
// role workspaces land in Task 7; for now a placeholder confirms the signed-in
// role + allocated party so the gate + per-tab lock are demonstrable end to end.
import { HttpLedgerClient } from '../../ledger-client/src/client';
import { WalletClient } from '../../ledger-client/src/wallet';
import registry from './party-registry.json';
import { WalletSessionProvider, useSession } from './state/WalletSession';
import SignIn from './views/SignIn';
import './styles.css';

// Single shared wallet client for the tab's lifetime. Reads + interactive
// submission go through the Vite dev-proxy (/api → reverse-proxy → ledger API).
// The synchronizer id is pinned from the registry so the first onboard needs no
// discovery round-trip.
const reads = new HttpLedgerClient('/api');
const walletClient = new WalletClient('/api', reads, undefined, registry.synchronizerId);

function Gate() {
  const { isSignedIn, role, party, fingerprint, signOut } = useSession();

  if (!isSignedIn) return <SignIn />;

  // Placeholder workspace (Task 7 replaces this with the real role views).
  return (
    <div className="stack g4">
      <header className="topbar">
        <span className="wordmark">
          Continuum<span className="dot">.</span>
        </span>
        <span className="deal-badge">Confidential closing room</span>
        <span className="spacer" />
        <span className="view-label">Signed in as {role}</span>
        <button type="button" className="btn ghost" onClick={signOut}>
          Sign out
        </button>
      </header>

      <main className="portal-wrap">
        <div className="portal-lede">
          <span className="eyebrow accent">Connected</span>
          <h1>Signed in as {role}.</h1>
          <p>
            This tab is locked to the <strong>{role}</strong> seat for the rest of the session. Open another
            seat in a separate tab to act as a different role. The real role workspace lands in the next step.
          </p>
        </div>
        <p className="section-label">Wallet</p>
        <div className="stack g2">
          <div className="acc-role">Party</div>
          <code className="acc-org" style={{ wordBreak: 'break-all' }}>
            {party}
          </code>
          <div className="acc-role">Key fingerprint</div>
          <code className="acc-org" style={{ wordBreak: 'break-all' }}>
            {fingerprint}
          </code>
        </div>
      </main>
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
