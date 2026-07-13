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
import FocusedPage from './views/FocusedPage';
import SignIn from './views/SignIn';
import Settlement from './views/Settlement';
import './styles.css';

// Each seat's human label (topbar chrome). The GP lands on the full Deal Page; every
// narrow seat lands on its role-scoped FocusedPage.
const SEAT_LABEL: Record<Role, string> = {
  gp: 'Advisor',
  buyer: 'Secondary Buyer',
  lpExiting: 'Exiting LP',
  lpRolling: 'Rolling LP',
  lpac: 'LPAC Oversight',
  valuer: 'Independent Valuer',
};

// Operator seat-switch bar: pivot between the six seats without signing out.
const SEATS: Array<{ role: Role; label: string }> = [
  { role: 'gp', label: 'GP' },
  { role: 'valuer', label: 'Valuer' },
  { role: 'lpac', label: 'LPAC' },
  { role: 'buyer', label: 'Buyer' },
  { role: 'lpExiting', label: 'Exiting LP' },
  { role: 'lpRolling', label: 'Rolling LP' },
];

function SeatBar({ current, onSwitch }: { current: Role; onSwitch: (r: Role) => void }) {
  return (
    <nav className="seat-bar" aria-label="Switch seat">
      <span className="seat-bar-label">Seat</span>
      {SEATS.map((s) => (
        <button
          key={s.role}
          type="button"
          className={`seat-bar-btn${s.role === current ? ' on' : ''}`}
          aria-current={s.role === current ? 'true' : undefined}
          onClick={() => s.role !== current && onSwitch(s.role)}
        >
          {s.label}
        </button>
      ))}
    </nav>
  );
}

function Gate() {
  const { isSignedIn, role, custodianName, ready, signOut, signIn } = useSession();

  const switchSeat = (r: Role) => {
    void signIn(r, `${r}-demo`).catch(() => {});
  };

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
    <div className="stack g4 has-seat-bar">
      <header className="topbar">
        <span className="wordmark">
          Continuum<span className="dot">.</span>
        </span>
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
        {/* GP orchestrates → full Deal Page; every narrow seat → role-scoped FocusedPage. */}
        {role === 'gp' ? <DealPage /> : <FocusedPage />}
      </main>

      {/* Overlays the workspace with a full-screen SETTLED takeover once this
          party's own projection sees the atomic close. */}
      <Settlement />

      <SeatBar current={role} onSwitch={switchSeat} />
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
