// Sign-in gate (custody build). An account-picker — one card per demo role — that
// logs in against the CUSTODY BACKEND. Picking a seat opens a credential panel
// (username prefilled to the role, password prefilled to the demo secret) showing
// that role's signing CUSTODIAN. On success the backend sets an httpOnly session
// cookie and the app re-renders into the role workspace.
//
// SECURITY: NO wallet, NO mnemonic, NO key material anywhere here. The only secret
// is the demo password, held in local component state and POSTed to /auth/login.
import { useState } from 'react';
import { ROLES, useSession, type Role } from '../state/WalletSession';
import { custodians } from '../lib/useLedger';
import { AVATAR } from '../lib/avatars';

type RoleMeta = {
  avatar: string;
  name: string;
  seat: string;
  blurb: string;
  cta: string;
  wide?: boolean;
};

// Mirrors the portal account-picker cards, one per role.
const META: Record<Role, RoleMeta> = {
  gp: {
    avatar: 'DW',
    name: 'Dana Whitfield · Whitfield Advisory',
    seat: 'Advisor / Organizer — runs the deal',
    blurb:
      'Runs the sealed-bid auction, sets the clearing price, computes the allocation, and fires the atomic close.',
    cta: 'Enter as organizer',
    wide: true,
  },
  lpRolling: {
    avatar: 'HP',
    name: 'Hawthorn Pension',
    seat: 'Investor — Rolling',
    blurb: 'One of 8 LPs. Rolls into the new vehicle at the clearing price — privately, unseen by peers.',
    cta: 'Enter as rolling LP',
  },
  lpExiting: {
    avatar: 'CF',
    name: 'Calder Family Office',
    seat: 'Investor — Exiting',
    blurb: 'Sells at the clearing price for cash — privately, unseen by other LPs.',
    cta: 'Enter as exiting LP',
  },
  buyer: {
    avatar: 'NB',
    name: 'Northbeam Secondaries',
    seat: 'Secondary Buyer',
    blurb: 'One of 4 buyers. Files a sealed bid blind to the others; reuses one verified credential across deals.',
    cta: 'Enter as buyer',
  },
  lpac: {
    avatar: 'LP',
    name: 'LPAC / Regulator',
    seat: 'Oversight — LPAC',
    blurb: 'Sees nothing pre-close; gets a scoped fairness view once it settles.',
    cta: 'Enter as oversight',
  },
  valuer: {
    avatar: 'KV',
    name: 'Kroll Valuation Services',
    seat: 'Independent Valuation Agent',
    // The GP is conflicted on both sides of this deal; the independent valuer is the check on
    // it. Giving the two of them the full-width cards reads as the shape of the story — and it
    // fills the sixth grid slot, which otherwise sat visibly empty next to Kroll.
    blurb: 'The independent agent. Signs and anchors the NAV range on-ledger — its hash is what the GP verifies against the served document.',
    cta: 'Enter as valuer',
    wide: true,
  },
};

// Demo credentials: username = role, password = `<role>-demo` (see custody spine).
const demoPassword = (role: Role): string => `${role}-demo`;

export default function SignIn() {
  const { signIn } = useSession();
  const [picked, setPicked] = useState<Role | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  // Reset the demo → a brand-new empty deal epoch. The ledger is append-only, so this
  // doesn't delete history; it advances the backend epoch so every seat's reads target
  // fresh, empty deal keys (pristine "no deal yet"). The GP then re-opens the room.
  async function resetDemo() {
    const ok = window.confirm(
      'Reset the demo?\n\nStarts a brand-new empty deal — every seat returns to its initial state and the GP re-opens the room. On-ledger history is preserved; the current deal is left behind.',
    );
    if (!ok) return;
    setResetting(true);
    try {
      await fetch('/demo/reset', { method: 'POST', credentials: 'include' });
      window.location.reload();
    } catch {
      setResetting(false);
    }
  }

  function choose(role: Role) {
    setPicked(role);
    setUsername(role); // backend username = role
    setPassword(demoPassword(role)); // prefill the demo secret for convenience
    setError(null);
  }

  async function submit() {
    if (!picked || !username.trim() || !password) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
      // On success the app re-renders into the role workspace (App gate).
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-shell">
      {/* Brand panel — who this is and what happens here. Institutional, no landing fluff. */}
      <div className="signin-brand">
        {/* Barely-there flow field: interweaving streams drifting forever. Decorative only —
            aria-hidden, pointer-events none, paused under prefers-reduced-motion. */}
        <svg className="brand-flow" viewBox="0 0 640 1000" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g className="ff-slow">
            <path d="M-60,140 C120,90 260,230 420,170 S640,90 720,150" />
            <path d="M-60,320 C140,270 300,410 460,340 S660,260 720,330" />
            <path d="M-60,520 C120,470 280,600 440,540 S650,460 720,530" />
            <path d="M-60,720 C150,660 300,800 460,730 S660,650 720,720" />
            <path d="M-60,900 C140,850 300,980 460,910 S660,840 720,900" />
          </g>
          <g className="ff-fast">
            <path d="M-60,220 C160,180 280,300 450,250 S650,190 720,240" />
            <path d="M-60,430 C150,380 300,500 460,440 S660,370 720,430" />
            <path d="M-60,620 C140,570 290,700 450,630 S655,560 720,620" />
            <path d="M-60,810 C150,760 300,880 460,820 S660,750 720,810" />
          </g>
        </svg>
        <span className="wordmark">
          Continuum<span className="dot">.</span>
        </span>
        <span className="sb-eyebrow">GP-led continuation deals</span>
        <h1>The entire deal, in&nbsp;one confidential workspace</h1>
        <p>
          A sealed-bid auction sets the price, investors elect privately, and every leg settles together —
          or none do.
        </p>

        <ul className="usp" aria-label="What you get">
          <li>Sealed-bid price discovery</li>
          <li>Private LP elections</li>
          <li>Qualified custodian per seat</li>
          <li>All-or-nothing settlement</li>
          <li>No keys in the browser</li>
        </ul>

        <div className="actions sb-actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              const first = document.querySelector<HTMLButtonElement>('.accounts .account');
              first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              first?.focus({ preventScroll: true });
            }}
          >
            Enter demo workspace
          </button>
          <a className="btn" href="/pitch-deck">
            See how it works
          </a>
        </div>

        <div className="sb-foot">
          <span>Canton devnet · Custody-signed execution · Atomic settlement</span>
          <span>Open multiple seats in separate tabs to experience the same close from every side.</span>
        </div>
      </div>

      <div className="signin-accounts">
        {/* Picking a seat expands its credentials INLINE, under the row — the list never
            unmounts, so nothing on screen jumps or reflows away from the pointer. */}
        <p className="section-label">Choose your seat</p>
        <div className="accounts">
          {ROLES.map((role) => {
            const m = META[role];
            const custodian = custodians[role];
            const open = picked === role;
            return (
              <div key={role} className={`account-slot${open ? ' open' : ''}`}>
                <button
                  className="account"
                  type="button"
                  data-role={role}
                  aria-expanded={open}
                  onClick={() => (open ? setPicked(null) : choose(role))}
                >
                  <span className="acc-avatar" aria-hidden="true">
                    <img src={AVATAR[role]} alt="" />
                  </span>
                  <span>
                    <span className="acc-name">{m.name}</span>
                    <span className="acc-role" style={{ display: 'block' }}>
                      {m.seat}
                      {custodian ? ` · ${custodian}` : ''}
                    </span>
                  </span>
                  <span className="acc-enter">{open ? 'Close' : m.cta}</span>
                </button>
                {open && (
                  <InlineLogin
                    cta={m.cta}
                    username={username}
                    password={password}
                    busy={busy}
                    error={error}
                    onUsername={setUsername}
                    onPassword={setPassword}
                    onSubmit={submit}
                    onBack={() => setPicked(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
        <div className="portal-foot">
          <span className="note">Demo credentials are prefilled — pick a seat and sign in.</span>
          <button type="button" className="btn ghost" onClick={resetDemo} disabled={resetting}>
            {resetting ? 'Resetting…' : 'Reset demo'}
          </button>
        </div>
      </div>
    </div>
  );
}

function InlineLogin(props: {
  cta: string;
  username: string;
  password: string;
  busy: boolean;
  error: string | null;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { cta, username, password, busy, error, onUsername, onPassword, onSubmit, onBack } = props;
  return (
    <form
      className="account-login"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="form-grid">
        <div className="form-row">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            className="input"
            value={username}
            autoComplete="username"
            spellCheck={false}
            onChange={(e) => onUsername(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => onPassword(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
        </div>
      </div>
      <span className="hint">Your custodian signs on your behalf — no signing key ever touches this browser.</span>
      {error ? <div className="field-err">{error}</div> : null}
      <div className="actions">
        <button type="submit" className="btn primary" disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : cta}
        </button>
        <button type="button" className="btn ghost" onClick={onBack} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

