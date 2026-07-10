// App shell (spec §4 / demo-script.md). Five persona tabs, a single shared
// MockLedgerClient instance so state carries across persona switches, and a
// "Viewing as" control that drives PartyContext.setCurrent — switching party
// re-renders the active view against that party's ledger projection. THIS is
// the privacy demo.
import { useMemo } from 'react';
import { MockLedgerClient } from './ledger/mock';
import { partyRegistry } from './ledger/party-registry.mock';
import { PartyProvider, useParty } from './state/PartyContext';
import Advisor from './views/Advisor';
import Buyer from './views/Buyer';
import ExitingLP from './views/ExitingLP';
import RollingLP from './views/RollingLP';
import Oversight from './views/Oversight';
import './styles.css';

// Single shared instance for the whole app's lifetime — NOT re-created per
// view or per persona switch, so contracts created as one party are visible
// (subject to projection) when viewing as another.
const client = new MockLedgerClient();

const TABS = [
  { key: 'gp', label: 'Advisor' },
  { key: 'buyer', label: 'Secondary Buyer' },
  { key: 'lp', label: 'Investor — Leaving' },
  { key: 'lp2', label: 'Investor — Staying' },
  { key: 'lpac', label: 'Oversight — LPAC' },
] as const;

function Shell() {
  const { current, setCurrent, personas } = useParty();

  const view = (() => {
    if (current === personas.gp) return <Advisor client={client} />;
    if (current === personas.buyer) return <Buyer client={client} />;
    if (current === personas.lp) return <ExitingLP client={client} />;
    if (current === personas.lp2) return <RollingLP client={client} />;
    if (current === personas.lpac) return <Oversight client={client} />;
    return null;
  })();

  return (
    <div className="stack g4">
      <header className="topbar">
        <span className="wordmark">
          Continuum<span className="dot">.</span>
        </span>
        <span className="spacer" />
        <label className="mono" htmlFor="viewing-as" style={{ fontSize: 12, color: 'var(--mute)' }}>
          Viewing as
        </label>
        <select id="viewing-as" className="input" value={current} onChange={(e) => setCurrent(e.target.value)}>
          {TABS.map((t) => (
            <option key={t.key} value={personas[t.key]}>
              {t.label}
            </option>
          ))}
        </select>
      </header>

      <nav className="stepper" aria-label="Persona tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`stp${personas[t.key] === current ? ' active' : ''}`}
            onClick={() => setCurrent(personas[t.key])}
          >
            <span className="sl">{t.label}</span>
          </button>
        ))}
      </nav>

      <main>{view}</main>

      <p className="sim-note">
        Simulation — no Canton, no wallets, no network. State is in-memory (MockLedgerClient); the
        privacy is real: each persona only ever reads its own ledger projection.
      </p>
    </div>
  );
}

export default function App() {
  // Registry.parties is typed as a plain Record<string, string> (loadRegistry
  // validates every value at runtime but can't narrow the type per-key); the
  // mock registry always defines `gp`, so this cast is safe here.
  const personas = useMemo(() => partyRegistry.parties as { gp: string } & Record<string, string>, []);
  return (
    <PartyProvider personas={personas}>
      <Shell />
    </PartyProvider>
  );
}
