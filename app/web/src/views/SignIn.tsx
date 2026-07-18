// Sign-in gate (custody build). An account-picker — one card per demo role — that
// logs in against the CUSTODY BACKEND. Picking a seat opens a credential panel
// (username prefilled to the role, password prefilled to the demo secret) showing
// that role's signing CUSTODIAN. On success the backend sets an httpOnly session
// cookie and the app re-renders into the role workspace.
//
// SECURITY: NO wallet, NO mnemonic, NO key material anywhere here. The only secret
// is the demo password, held in local component state and POSTed to /auth/login.
import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ROLES, useSession, type Role } from '../state/WalletSession';
import { custodians } from '../lib/useLedger';
import { AVATAR } from '../lib/avatars';
import logo from '../assets/logo.svg';

// The flow-field streams, drawn once as the faint base layer and once again inside
// the cursor spotlight mask (identical structure keeps the dash phases in sync).
const FF_SLOW = [
  'M-60,140 C120,90 260,230 420,170 S640,90 720,150',
  'M-60,320 C140,270 300,410 460,340 S660,260 720,330',
  'M-60,520 C120,470 280,600 440,540 S650,460 720,530',
  'M-60,720 C150,660 300,800 460,730 S660,650 720,720',
  'M-60,900 C140,850 300,980 460,910 S660,840 720,900',
];
const FF_FAST = [
  'M-60,220 C160,180 280,300 450,250 S650,190 720,240',
  'M-60,430 C150,380 300,500 460,440 S660,370 720,430',
  'M-60,620 C140,570 290,700 450,630 S655,560 720,620',
  'M-60,810 C150,760 300,880 460,820 S660,750 720,810',
];

function FlowLines() {
  return (
    <>
      <g className="ff-slow">
        {FF_SLOW.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g className="ff-fast">
        {FF_FAST.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </>
  );
}

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

// For now the demo enters a seat in ONE click — the credential form is hidden, not
// removed. Flip this back on to restore the inline username/password panel.
const SHOW_LOGIN_FORM: boolean = false;

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
      // Reset advances the backend epoch. The demo runs in several tabs at once, and every
      // OTHER open seat still holds the old epoch's keys — it would keep rendering the stale
      // deal (and desync into cross-tab duplicates). Broadcast so they reload onto the fresh
      // epoch too; BroadcastChannel never delivers to the sender, so this tab just reloads below.
      try {
        new BroadcastChannel('continuum-demo').postMessage('reset');
      } catch {
        /* BroadcastChannel unsupported — this tab still resets via the reload below */
      }
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

  // One-click entry: the demo credentials are known, so a seat signs in directly.
  async function enter(role: Role) {
    if (busy) return;
    setPicked(role);
    setBusy(true);
    setError(null);
    try {
      await signIn(role, demoPassword(role));
      // On success the app re-renders into the role workspace (App gate).
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  // Deep link: /?seat=<role> — the per-role "open in a new window" links land here.
  // With the login form hidden it enters the seat directly; otherwise it opens the panel.
  useEffect(() => {
    const seat = new URLSearchParams(window.location.search).get('seat');
    if (!seat || !(ROLES as readonly string[]).includes(seat)) return;
    if (SHOW_LOGIN_FORM) choose(seat as Role);
    else void enter(seat as Role);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

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

  // Cursor spotlight over the flow field: mousemove sets a target in SVG user space,
  // a rAF loop eases the gradient centre toward it (attribute writes only — the React
  // tree never re-renders). On leave the target glides off-canvas and the loop stops.
  const flowSvg = useRef<SVGSVGElement | null>(null);
  const flowSpot = useRef<SVGRadialGradientElement | null>(null);
  const spotPos = useRef({ x: -600, y: -600 });
  const spotTarget = useRef({ x: -600, y: -600 });
  const spotRaf = useRef(0);
  // Leaving the panel doesn't move the spotlight — it stays put and fades out slowly
  // (the `idle` class drives a long opacity transition on the highlight layer).
  const [flowIdle, setFlowIdle] = useState(true);

  const spotStep = () => {
    const pos = spotPos.current;
    const t = spotTarget.current;
    pos.x += (t.x - pos.x) * 0.16;
    pos.y += (t.y - pos.y) * 0.16;
    const g = flowSpot.current;
    if (g) {
      g.setAttribute('cx', pos.x.toFixed(1));
      g.setAttribute('cy', pos.y.toFixed(1));
    }
    if (Math.hypot(t.x - pos.x, t.y - pos.y) > 0.6) spotRaf.current = requestAnimationFrame(spotStep);
    else spotRaf.current = 0;
  };
  const kickSpot = () => {
    if (!spotRaf.current) spotRaf.current = requestAnimationFrame(spotStep);
  };
  const onFlowMove = (e: React.MouseEvent) => {
    const svg = flowSvg.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    spotTarget.current = { x: p.x, y: p.y };
    // First move after an idle spell: snap the spot to the cursor so the glow
    // fades in where the pointer IS, instead of gliding in from its last spot.
    if (flowIdle) spotPos.current = { x: p.x, y: p.y };
    setFlowIdle(false);
    kickSpot();
  };
  const onFlowLeave = () => setFlowIdle(true);
  useEffect(() => () => cancelAnimationFrame(spotRaf.current), []);

  return (
    <div className="signin-shell">
      {/* Brand panel — who this is and what happens here. Institutional, no landing fluff. */}
      <div className="signin-brand" onMouseMove={onFlowMove} onMouseLeave={onFlowLeave}>
        {/* Barely-there flow field: interweaving streams drifting forever. Decorative only —
            aria-hidden, pointer-events none, paused under prefers-reduced-motion. A brighter
            copy of the same lines sits under a cursor-following radial mask, so the streams
            glow softly where the pointer travels (attributes only — no React re-renders). */}
        <svg
          ref={flowSvg}
          className={`brand-flow${flowIdle ? ' idle' : ''}`}
          viewBox="0 0 640 1000"
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          <defs>
            <radialGradient id="ff-spot" gradientUnits="userSpaceOnUse" cx="-600" cy="-600" r="210" ref={flowSpot}>
              <stop offset="0" stopColor="#fff" stopOpacity="0.9" />
              <stop offset="0.55" stopColor="#fff" stopOpacity="0.35" />
              <stop offset="1" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <mask id="ff-spot-mask">
              <rect x="-200" y="-250" width="1080" height="1500" fill="url(#ff-spot)" />
            </mask>
          </defs>
          <FlowLines />
          <g className="ff-hi" mask="url(#ff-spot-mask)">
            <FlowLines />
          </g>
        </svg>
        <span className="logo-lockup">
          <img className="logo" src={logo} alt="Continuum" />
          <span className="logo-ver">v0.1</span>
        </span>
        <span className="sb-eyebrow">GP-led continuation deals</span>
        <h1>The entire deal, in&nbsp;one confidential workspace</h1>
        <p>
          A sealed-bid auction sets the price, investors elect privately,
          <br className="br-wide" /> and every leg settles together — or none do.
        </p>

        <ul className="usp" aria-label="What you get">
          <li>Sealed-bid price discovery</li>
          <li>Private LP elections</li>
          <li>Qualified custodian per seat</li>
          <li>All-or-nothing settlement</li>
          <li>No keys in the browser</li>
        </ul>

        <div className="actions sb-actions">
          {/* ONE link to the pitch: the deck IS the "how it works" story, and the demo
              itself is entered by picking a seat. Served at the clean /deck/ path by
              both the dev server (web/public) and the custody spine (web/dist). */}
          <a className="btn primary" href="/deck/" target="_blank" rel="noopener noreferrer">
            Pitch deck
          </a>
        </div>

        <div className="sb-foot">
          <span>Canton devnet · Custody-signed execution · Atomic settlement</span>
          <span>Open multiple seats in separate tabs to experience the same close from every side.</span>
        </div>
      </div>

      <div className="signin-accounts">
        {/* One-click seats: the row itself signs in (demo credentials are known).
            With SHOW_LOGIN_FORM the row expands its credentials inline instead. */}
        <p className="section-label">Choose your seat</p>
        <div className="accounts">
          {ROLES.map((role) => {
            const m = META[role];
            const custodian = custodians[role];
            const open = SHOW_LOGIN_FORM && picked === role;
            const entering = !SHOW_LOGIN_FORM && busy && picked === role;
            return (
              <div key={role} className={`account-slot${open ? ' open' : ''}`}>
                <button
                  className="account"
                  type="button"
                  data-role={role}
                  aria-expanded={SHOW_LOGIN_FORM ? open : undefined}
                  disabled={!SHOW_LOGIN_FORM && busy}
                  onClick={() =>
                    SHOW_LOGIN_FORM ? (open ? setPicked(null) : choose(role)) : void enter(role)
                  }
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
                  <span className={`acc-enter${entering ? ' entering' : ''}`}>
                    {entering ? 'Signing in…' : m.cta}
                  </span>
                </button>
                {/* The demo is meant to be watched from several seats at once — every
                    role can open in its own window, with the login panel ready. */}
                <a
                  className="acc-newwin"
                  href={`/?seat=${role}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open this seat in a new window"
                  aria-label={`Open ${m.name} in a new window`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
                </a>
                {SHOW_LOGIN_FORM && open && (
                  <div className="account-login-wrap">
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
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="portal-foot">
          <span className="note">
            Demo credentials are prefilled — pick a seat and sign in. Your custodian signs on your behalf; no
            key ever touches this browser.
          </span>
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

