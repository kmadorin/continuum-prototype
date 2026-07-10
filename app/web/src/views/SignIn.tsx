// Sign-in gate (Task 6). An account-picker screen — one card per role — plus a
// "connect wallet" affordance: generate a fresh Canton external-party wallet, or
// paste an existing mnemonic to restore one. Picking a seat + connecting signs
// THIS tab in as that role and locks it there for the session (see WalletSession).
//
// SECURITY: the mnemonic entered/generated here is wallet key material. It is held
// in local component state and handed to `signIn` (which keeps it in-memory +
// per-tab sessionStorage and sends only the derived PUBLIC key to the server).
// It is NEVER logged or transmitted anywhere else.
import { useState } from 'react';
import { generateMnemonic } from '../../../ledger-client/src/ed25519';
import { ROLES, useSession, type Role } from '../state/WalletSession';

type RoleMeta = {
  avatar: string;
  name: string;
  seat: string;
  blurb: string;
  cta: string;
  wide?: boolean;
};

// Mirrors portal/index.html — the account-picker cards, one per role.
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
};

export default function SignIn() {
  const { signIn } = useSession();
  // Which seat the user picked (null = still choosing).
  const [picked, setPicked] = useState<Role | null>(null);
  const [mnemonic, setMnemonic] = useState('');
  const [generated, setGenerated] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(role: Role) {
    setPicked(role);
    setMnemonic('');
    setGenerated(false);
    setError(null);
  }

  function generate() {
    setMnemonic(generateMnemonic());
    setGenerated(true);
    setError(null);
  }

  async function connect() {
    if (!picked || !mnemonic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await signIn(picked, mnemonic.trim());
      // On success the app re-renders into the role workspace (App gate).
    } catch (e) {
      // Surface onboarding/derivation failures — never swallow. (No key material
      // is included: `e.message` is a Canton/derivation error, not the seed.)
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
          sets the price, investors elect privately, and every leg settles at once or not at all. Each seat
          signs in with its own Canton wallet and sees only its own part. Open several seats in separate tabs
          to watch the same close from every side.
        </p>
      </div>

      {picked === null ? (
        <>
          <p className="section-label">Choose an account</p>
          <div className="accounts">
            {ROLES.map((role) => {
              const m = META[role];
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
        <ConnectWallet
          role={picked}
          meta={META[picked]}
          mnemonic={mnemonic}
          generated={generated}
          busy={busy}
          error={error}
          onMnemonic={setMnemonic}
          onGenerate={generate}
          onConnect={connect}
          onBack={() => setPicked(null)}
        />
      )}
    </div>
  );
}

function ConnectWallet(props: {
  role: Role;
  meta: RoleMeta;
  mnemonic: string;
  generated: boolean;
  busy: boolean;
  error: string | null;
  onMnemonic: (v: string) => void;
  onGenerate: () => void;
  onConnect: () => void;
  onBack: () => void;
}) {
  const { meta, mnemonic, generated, busy, error, onMnemonic, onGenerate, onConnect, onBack } = props;
  return (
    <div className="stack g4" style={{ maxWidth: 560 }}>
      <p className="section-label">Connect a wallet</p>
      <div className="acc-top">
        <span className="acc-avatar" aria-hidden="true">
          {meta.avatar}
        </span>
        <div>
          <div className="acc-name">{meta.name}</div>
          <div className="acc-role">{meta.seat}</div>
        </div>
      </div>

      <div className="stack g2">
        <button type="button" className="btn ghost" onClick={onGenerate} disabled={busy}>
          Generate a new wallet
        </button>
        <label className="acc-role" htmlFor="mnemonic">
          or paste an existing 12-word recovery phrase
        </label>
        <textarea
          id="mnemonic"
          className="input"
          rows={3}
          placeholder="word word word …"
          value={mnemonic}
          spellCheck={false}
          autoComplete="off"
          onChange={(e) => onMnemonic(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        {generated ? (
          <span className="note">
            Save this recovery phrase — it is your wallet key. It stays in this tab only and is never sent to
            any server.
          </span>
        ) : null}
        {error ? <div className="field-err">{error}</div> : null}
      </div>

      <div className="portal-foot">
        <button type="button" className="btn" onClick={onConnect} disabled={busy || !mnemonic.trim()}>
          {busy ? 'Connecting…' : meta.cta}
        </button>
        <button type="button" className="btn ghost" onClick={onBack} disabled={busy}>
          Back
        </button>
      </div>
    </div>
  );
}
