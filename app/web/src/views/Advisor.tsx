// portal/advisor.html — "Advisor / Organizer". Open the closing room
// (Continuum.Deal:ContinuationDeal), record LPAC consent (RecordConsent), set
// price & disclose (SetClearing), open elections (OpenElections) — all real
// choices now on the devnet ledger. Only "Close" has NO builder: the atomic
// Close needs real IssuanceBasis/ExecDelegation/Allocation contract IDs
// assembled off-UI (see app/scripts/close-minimal.ts), so it stays a visible
// demo-stage toggle, NOT a fabricated Daml command.
import { useEffect, useState } from 'react';
import type { ActiveContract, LedgerClient } from '../../../ledger-client/src/types';
import { useParty } from '../state/PartyContext';
import { createDeal, openElections, recordConsent, setClearing } from '../lib/ops';
import { Card, StageHead, fmtM, fmtPct, readDeal } from './shared';

const DEAL_DEFAULTS = {
  fund: 'Meridian Growth Fund III',
  cv: 'Meridian CV I',
  asset: 'Project Atlas',
  refNav: '52000000.0',
  deadline: '2026-08-15T00:00:00Z',
};

export default function Advisor({ client }: { client: LedgerClient }) {
  const { current, personas } = useParty();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [price, setPrice] = useState('0.96');
  const [lpacConsented, setLpacConsented] = useState(false); // demo stage only — no builder
  const [busy, setBusy] = useState(false);

  const refresh = async (alive: () => boolean = () => true) => {
    const d = await readDeal(client, current);
    if (alive()) setDeal(d);
  };

  useEffect(() => {
    let alive = true;
    refresh(() => alive);
    setLpacConsented(false);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const openRoom = async () => {
    setBusy(true);
    const room = [personas.buyer, personas.buyer2, personas.lp, personas.lp2, personas.lpac];
    await client.submit({
      commandId: `deal-${Date.now()}`,
      actAs: [current],
      commands: [createDeal({ gp: current, vehicle: personas.vehicle, room, ...DEAL_DEFAULTS })],
    });
    await refresh();
    setBusy(false);
  };

  const recordLpacConsent = async () => {
    if (!deal) return;
    setBusy(true);
    await client.submit({
      commandId: `consent-${Date.now()}`,
      actAs: [current],
      commands: [recordConsent(deal.contractId)],
    });
    await refresh();
    setLpacConsented(true);
    setBusy(false);
  };

  const setPriceAndDisclose = async () => {
    if (!deal) return;
    setBusy(true);
    await client.submit({
      commandId: `price-${Date.now()}`,
      actAs: [current],
      commands: [setClearing(deal.contractId, price)],
    });
    await refresh();
    setBusy(false);
  };

  const openElectionsNow = async () => {
    if (!deal) return;
    setBusy(true);
    await client.submit({
      commandId: `elections-${Date.now()}`,
      actAs: [current],
      commands: [openElections(deal.contractId)],
    });
    await refresh();
    setBusy(false);
  };

  const stage = (deal?.args.stage as string) ?? null;
  const clearingPrice = deal?.args.clearingPrice as string | null | undefined;

  return (
    <div className="stack g4">
      <StageHead
        tag="ADVISOR"
        role="Organizer"
        title="Set up the closing room"
        lede="One source of truth for the close. Everyone's invited — but nobody can see anyone else's private inputs."
      />

      <Card title={deal ? (deal.args.cv as string) : DEAL_DEFAULTS.cv}>
        <dl className="kv">
          <dt>Stage</dt>
          <dd>{stage ?? <span className="chip pending">no deal yet</span>}</dd>
          <dt>Clearing price</dt>
          <dd>{clearingPrice ? `${fmtPct(clearingPrice)} of NAV` : <span className="chip sealed">sealed — not yet set</span>}</dd>
          <dt>Reference NAV</dt>
          <dd>{deal ? fmtM(deal.args.refNav) : '—'}</dd>
        </dl>
      </Card>

      <div className="actions">
        <button className="btn" type="button" disabled={busy || !!deal} onClick={openRoom}>
          Open closing room
        </button>
        <button className="btn" type="button" disabled={busy || !deal || lpacConsented} onClick={recordLpacConsent}>
          Record LPAC consent
        </button>
        {lpacConsented && <span className="chip ok">LPAC consented</span>}
      </div>

      <div className="stack g3">
        <div className="form-row">
          <label htmlFor="price">Clearing price — % of NAV</label>
          <div className="input-group">
            <input className="input" id="price" type="number" step="0.01" min="0" max="1" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!deal} />
            <span className="suffix">of NAV</span>
          </div>
        </div>
        <div className="actions">
          <button className="btn" type="button" disabled={busy || !deal} onClick={setPriceAndDisclose}>
            Set price & disclose to room
          </button>
          <button className="btn" type="button" disabled={busy || !deal || !lpacConsented || !clearingPrice} onClick={openElectionsNow}>
            Open elections
          </button>
        </div>
      </div>

      <div className="actions">
        <button className="btn ghost" type="button" disabled title="Close needs the real IssuanceBasis/ExecDelegation/Allocation contract IDs — assembled by Stream C">
          Close — all at once (Stream C)
        </button>
      </div>
      <p className="hint">
        "Record LPAC consent" now submits the real <span className="mono">RecordConsent</span> choice on
        the devnet ledger (moving the deal to <span className="mono">Consented</span> so elections can open).
        "Close" is still a visible demo stage only — the atomic <span className="mono">Close</span> needs
        pre-authorized ExecDelegation/Allocation contract IDs assembled off-UI (see close-minimal.ts).
      </p>
    </div>
  );
}
