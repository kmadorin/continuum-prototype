// App gate (custody build). The browser holds NO signing key: each role logs in
// with backend credentials, and the CUSTODY BACKEND signs that party's txs under
// policy. Not signed in → the SignIn screen. Signed in → that role's workspace,
// which renders the shared application Shell (sidebar, page header, content):
// the GP gets the full lifecycle Deal Page, every narrow seat a focused page.
// All chrome that used to live here (topbar, trust footer) now lives in the Shell.
import { SessionProvider, useSession } from './state/WalletSession';
import { ToastProvider } from './state/Toast';
import { InspectorProvider } from './state/Inspector';
import DealPage from './views/DealPage';
import FocusedPage from './views/FocusedPage';
import SignIn from './views/SignIn';
import Settlement from './views/Settlement';
import './styles.css';

function Gate() {
  const { isSignedIn, role, ready } = useSession();

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
    <>
      {/* GP orchestrates → full Deal Page; every narrow seat → role-scoped FocusedPage.
          Both render the Shell themselves (their nav differs). */}
      {role === 'gp' ? <DealPage /> : <FocusedPage />}

      {/* Overlays the workspace with the SETTLED dialog once this party's own
          projection sees the atomic close. Dismissable — the proof lives behind it. */}
      <Settlement />
    </>
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
