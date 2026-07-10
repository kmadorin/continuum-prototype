// Small shared helpers for the persona views. Not one of the five required
// files itself — it exists to avoid duplicating formatting/markup across
// Advisor/Buyer/ExitingLP/RollingLP/Oversight, all of which reuse the same
// prototype/styles.css classes (.card, .kv, .chip, .stage-head, .actions...).
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { ActiveContract, LedgerClient } from '../../../ledger-client/src/types';
import { election } from '../lib/ops';

export const fmtPct = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? `${(n * 100).toFixed(0)}%` : '—';
};

export const fmtM = (v: unknown): string => {
  const n = Number(v);
  return Number.isFinite(n) ? `$${(n / 1_000_000).toFixed(1)}M` : '—';
};

export function StageHead({ tag, role, title, lede }: { tag: string; role: string; title: string; lede: string }) {
  return (
    <div className="stage-head">
      <span className="persona-tag">
        {tag} <span className="role">· {role}</span>
      </span>
      <h1>{title}</h1>
      <p className="lede">{lede}</p>
    </div>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

export function latest(contracts: ActiveContract[]): ActiveContract | null {
  return contracts.length ? contracts[contracts.length - 1] : null;
}

export async function readDeal(client: LedgerClient, party: string): Promise<ActiveContract | null> {
  const cs = await client.activeContracts(party, { templateId: 'ContinuationDeal' });
  return latest(cs);
}

// Shared body for ExitingLP ("Sell") and RollingLP ("Roll over") — same command
// (Continuum.Election:LPElection), same peer-blindness story, opposite full-NAV
// split. The Daml template has no Roll/Sell enum: "sell" = full positionNav ->
// sellNav, 0 -> rollNav (and vice-versa for "roll"), with the invariant
// rollNav + sellNav == positionNav enforced on-ledger.
export function LPElectionView({
  client,
  lpParty,
  intent,
  personLabel,
  positionNav,
}: {
  client: LedgerClient;
  lpParty: string;
  intent: 'sell' | 'roll';
  personLabel: string;
  positionNav: string;
}) {
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [filed, setFiled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sealedProofCount, setSealedProofCount] = useState<number | null>(null);

  // `alive` guards against a setState after the view unmounts (persona switch)
  // while an ACS fetch is still in flight — benign with the sync mock, a
  // footgun once HttpLedgerClient adds real latency.
  const refresh = async (alive: () => boolean = () => true) => {
    const d = await readDeal(client, lpParty);
    const mine = await client.activeContracts(lpParty, { templateId: 'LPElection' });
    if (!alive()) return;
    setDeal(d);
    setFiled(mine.length > 0);
  };

  useEffect(() => {
    let alive = true;
    refresh(() => alive);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lpParty]);

  const fileElection = async () => {
    setBusy(true);
    const rollNav = intent === 'roll' ? positionNav : '0.0';
    const sellNav = intent === 'sell' ? positionNav : '0.0';
    await client.submit({
      commandId: `election-${lpParty}-${Date.now()}`,
      actAs: [lpParty],
      commands: [
        election({
          lp: lpParty,
          deal: (deal?.args.cv as string) ?? 'unknown-deal',
          positionNav,
          rollNav,
          sellNav,
          disclosureHash: 'demo-disclosure-hash',
        }),
      ],
    });
    await refresh();
    setBusy(false);
    setSealedProofCount(null);
  };

  const cv = (deal?.args.cv as string) ?? null;
  const clearingPrice = deal?.args.clearingPrice as string | null | undefined;
  const label = intent === 'sell' ? 'Sell' : 'Roll over';
  // Match the real Daml gating: LPs can only elect once the advisor has run
  // OpenElections (stage == Electing). Filing during Bidding would break the
  // honest demo sequence.
  const electionsOpen = deal?.args.stage === 'Electing';

  return (
    <div className="stack g4">
      <StageHead
        tag={personLabel.toUpperCase()}
        role={intent === 'sell' ? 'Investor — Leaving' : 'Investor — Staying'}
        title={intent === 'sell' ? 'Decide: cash out at the set price' : 'Decide: roll into the new vehicle'}
        lede="Each LP decides roll vs sell at the set price — and no LP sees another LP's choice. The advisor sees that you decided, never what."
      />
      <Card title={cv ?? 'No deal open yet'}>
        <dl className="kv">
          <dt>Clearing price</dt>
          <dd>{clearingPrice ? `${fmtPct(clearingPrice)} of NAV` : <span className="chip sealed">sealed — not yet set</span>}</dd>
          <dt>Your position</dt>
          <dd>{fmtM(positionNav)} NAV</dd>
        </dl>
      </Card>
      {!filed ? (
        <div className="actions">
          <button className="btn" type="button" disabled={busy || !electionsOpen} onClick={fileElection}>
            {label}
          </button>
          {!deal && <span className="hint">Waiting for the advisor to open the closing room.</span>}
          {deal && !electionsOpen && (
            <span className="hint">Waiting for elections to open — the advisor sets the price and clicks Open elections first.</span>
          )}
        </div>
      ) : (
        <div className="actions">
          <span className="chip ok">Election filed — {label}</span>
          <span className="cant-see">No amount is visible to the advisor or other LPs — only that you filed.</span>
          <button
            className="btn ghost"
            type="button"
            onClick={async () => {
              // Honest privacy demo: LPElection is peer-blind by construction in
              // MockLedgerClient (stakeholders = actAs only), so no other party's
              // activeContracts() call — not the advisor's, not the other LP's —
              // will ever return this contract. We can only read our own copy.
              const mine = await client.activeContracts(lpParty, { templateId: 'LPElection' });
              setSealedProofCount(mine.length);
            }}
          >
            Prove it's sealed
          </button>
        </div>
      )}
      {sealedProofCount !== null && (
        <p className="hint">
          Your own ledger view shows {sealedProofCount} election(s) of yours. LPElection's sole
          signatory is you — no other party's activeContracts() query can ever surface it.
        </p>
      )}
    </div>
  );
}
