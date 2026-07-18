// App gate (custody build). The browser holds NO signing key: each role logs in
// with backend credentials, and the CUSTODY BACKEND signs that party's txs under
// policy. Not signed in → the SignIn screen. Signed in → that role's workspace,
// which renders the shared application Shell (sidebar, page header, content):
// the GP gets the full lifecycle Deal Page, every narrow seat a focused page.
// All chrome that used to live here (topbar, trust footer) now lives in the Shell.
import { useEffect } from 'react';
import { SessionProvider, useSession } from './state/WalletSession';
import { ToastProvider } from './state/Toast';
import { InspectorProvider } from './state/Inspector';
import DealPage from './views/DealPage';
import FocusedPage from './views/FocusedPage';
import SignIn from './views/SignIn';
import PitchDeck from './views/PitchDeck';
import Settlement from './views/Settlement';
import './styles.css';

function Gate() {
  const { isSignedIn, role, ready } = useSession();

  // Temporary internal route: the pitch, as a public read-only page (linked from the
  // presentation deck at /deck/). Resolved on pathname so it works in dev and behind
  // the custody spine's SPA fallback alike — no router needed for one page.
  if (window.location.pathname === '/pitch-deck') return <PitchDeck />;

  // Wait for the initial /me restore + registry load so a reload doesn't flash the
  // SignIn screen for an already-authenticated session.
  if (!ready) {
    return (
      <div className="boot">
        <div className="boot-inner">
          <span className="toast-spinner" aria-hidden="true" />
          Restoring session…
        </div>
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

// The PREVIEW disclaimer belongs to the preview deployment and local dev only —
// production (continuum-custody.fly.dev) must never brand itself as a preview.
// Host-gated so one build serves both: `has-banner` also flips --preview-h, which
// every sticky-header offset reads (0 when the banner is absent).
const IS_PREVIEW = /localhost|^127\.|preview/.test(window.location.hostname);

export default function App() {
  // A demo reset in ANY tab advances the backend epoch; every other open seat must reload
  // onto the new epoch or it keeps rendering the old deal and desyncs into cross-tab
  // duplicates. SignIn's Reset broadcasts here (the sender reloads itself directly).
  useEffect(() => {
    let ch: BroadcastChannel | null = null;
    try {
      ch = new BroadcastChannel('continuum-demo');
      ch.onmessage = (e) => {
        if (e.data === 'reset') window.location.reload();
      };
    } catch {
      /* BroadcastChannel unsupported — same-tab reset still works */
    }
    return () => ch?.close();
  }, []);

  return (
    <InspectorProvider>
      <ToastProvider>
        <SessionProvider>
          {/* Preview disclaimer sits ABOVE the whole layout in normal flow — it pushes
              the shell/sign-in/pitch down rather than overlaying them. */}
          <div className={`app-frame${IS_PREVIEW ? ' has-banner' : ''}`}>
            {IS_PREVIEW && (
              <div className="preview-banner" role="status">
                <span>
                  <b>PREVIEW</b> — simulated ledger. Not on-chain.
                </span>
              </div>
            )}
            <Gate />
          </div>
        </SessionProvider>
      </ToastProvider>
    </InspectorProvider>
  );
}
