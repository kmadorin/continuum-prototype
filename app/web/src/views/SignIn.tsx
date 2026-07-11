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
    blurb: 'The independent agent. Signs and anchors the NAV range on-ledger — its hash is what every other seat verifies.',
    cta: 'Enter as valuer',
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
    <div className="portal-wrap">
      <div className="portal-lede">
        <span className="eyebrow accent">Sign in</span>
        <h1>Run a GP-led continuation deal, end to end.</h1>
        <p>
          Continuum runs continuation closes as a single confidential workspace — a sealed-bid buyer auction
          sets the price, investors elect privately, and every leg settles at once or not at all. Each seat is
          held at its own qualified custodian, which signs on the party's behalf under policy. Open several
          seats in separate tabs to watch the same close from every side.
        </p>
      </div>

      {picked === null ? (
        <>
          <p className="section-label">Choose an account</p>
          <div className="accounts">
            {ROLES.map((role) => {
              const m = META[role];
              const custodian = custodians[role];
              return (
                <button
                  key={role}
                  className={`account${m.wide ? ' wide' : ''}`}
                  type="button"
                  data-role={role}
                  onClick={() => choose(role)}
                >
                  <div className="acc-top">
                    <span className="acc-avatar" aria-hidden="true">
                      {m.avatar}
                    </span>
                    <div>
                      <div className="acc-name">{m.name}</div>
                      <div className="acc-role">{m.seat}</div>
                    </div>
                  </div>
                  <div className="acc-org">{m.blurb}</div>
                  {custodian ? <div className="acc-custodian">Custodian · {custodian}</div> : null}
                  <span className="acc-enter">{m.cta}</span>
                </button>
              );
            })}
          </div>
          <div className="portal-foot">
            <span className="note">
              Tip — open several seats in separate tabs to watch the same close from every side.
            </span>
          </div>
        </>
      ) : (
        <LoginPanel
          meta={META[picked]}
          custodian={custodians[picked]}
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
}

function LoginPanel(props: {
  meta: RoleMeta;
  custodian?: string;
  username: string;
  password: string;
  busy: boolean;
  error: string | null;
  onUsername: (v: string) => void;
  onPassword: (v: string) => void;
  onSubmit: () => void;
  onBack: () => void;
}) {
  const { meta, custodian, username, password, busy, error, onUsername, onPassword, onSubmit, onBack } = props;
  return (
    <form
      className="stack g4"
      style={{ maxWidth: 480 }}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <p className="section-label">Sign in to your custodian</p>
      <div className="acc-top">
        <span className="acc-avatar" aria-hidden="true">
          {meta.avatar}
        </span>
        <div>
          <div className="acc-name">{meta.name}</div>
          <div className="acc-role">{meta.seat}</div>
          {custodian ? <div className="acc-custodian">Custodian · {custodian}</div> : null}
        </div>
      </div>

      <div className="stack g2">
        <label className="acc-role" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          className="input"
          value={username}
          autoComplete="username"
          spellCheck={false}
          onChange={(e) => onUsername(e.target.value)}
        />
        <label className="acc-role" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          className="input"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => onPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        <span className="note">
          Your custodian signs on your behalf — no signing key ever touches this browser.
        </span>
        {error ? <div className="field-err">{error}</div> : null}
      </div>

      <div className="portal-foot">
        <button type="submit" className="btn" disabled={busy || !username.trim() || !password}>
          {busy ? 'Signing in…' : meta.cta}
        </button>
        <button type="button" className="btn ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
      </div>
    </form>
  );
}
