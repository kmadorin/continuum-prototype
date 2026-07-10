// portal/advisor.html — "Advisor / Organizer". Open the closing room
// (Continuum.Deal:ContinuationDeal), set price & disclose (SetClearing), open
// elections (OpenElections). "Record LPAC consent" and "Close" have NO
// builder yet in app/web/src/lib/ops.ts (RecordConsent/Close assembly is
// Stream C's job — Close needs real IssuanceBasis/ExecDelegation/Allocation
// contract IDs this mock cannot fabricate). Those two are rendered as a
// visible demo-stage toggle, NOT as a fabricated Daml command.
import { useEffect, useState } from 'react';
import type { ActiveContract, LedgerClient } from '../../../ledger-client/src/types';
import { useParty } from '../state/PartyContext';
import { createDeal, openElections, setClearing } from '../lib/ops';
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
        <button className="btn" type="button" disabled={busy || !deal || lpacConsented} onClick={() => setLpacConsented(true)}>
          Record LPAC consent
        </button>
        {lpacConsented && <span className="chip ok">LPAC consented (demo stage)</span>}
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
        "Record LPAC consent" and "Close" have no ledger builder in this stream yet — Stream C
        wires the real <span className="mono">RecordConsent</span> and <span className="mono">Close</span> choices (Close
        needs pre-authorized ExecDelegation/Allocation contract IDs this mock cannot fabricate).
        These two buttons only advance a visible demo stage; no Daml command is submitted for them.
      </p>
    </div>
  );
}
