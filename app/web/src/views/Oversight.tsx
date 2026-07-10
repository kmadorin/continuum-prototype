// portal/oversight.html — "Oversight — LPAC". Reads whatever the LPAC party
// can see from the mock ACS. Real SettlementReceipt/FairnessDisclosure
// contracts only exist after Continuum.Deal:ContinuationDeal's Close choice
// runs (Deal.daml:96-101) — no builder for Close exists in this stream (Stream
// C assembles it), so this view can only show the pre-close "a deal exists"
// scope plus an explicitly-labelled preview of the post-close scope.
import { useEffect, useState } from 'react';
import type { ActiveContract, LedgerClient } from '../../../ledger-client/src/types';
import { useParty } from '../state/PartyContext';
import { Card, StageHead, fmtM, fmtPct, readDeal } from './shared';

export default function Oversight({ client }: { client: LedgerClient }) {
  const { current } = useParty();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [receipts, setReceipts] = useState<ActiveContract[]>([]);
  const [disclosures, setDisclosures] = useState<ActiveContract[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const d = await readDeal(client, current);
      const r = await client.activeContracts(current, { templateId: 'SettlementReceipt' });
      const f = await client.activeContracts(current, { templateId: 'FairnessDisclosure' });
      if (!alive) return;
      setDeal(d);
      setReceipts(r);
      setDisclosures(f);
    })();
    return () => {
      alive = false;
    };
  }, [client, current]);

  const stage = (deal?.args.stage as string) ?? null;
  const clearingPrice = deal?.args.clearingPrice as string | null | undefined;
  const closed = stage === 'Closed';
  const refNav = deal?.args.refNav as string | undefined;

  return (
    <div className="stack g4">
      <StageHead
        tag="OVERSIGHT"
        role="LPAC"
        title="Verify it was fair"
        lede="Before the close, the LPAC saw only that a deal existed. After, they get a scoped window to verify it was fair — without ever seeing the live private inputs."
      />

      <Card title={deal ? (deal.args.cv as string) : 'No deal in scope yet'}>
        <dl className="kv">
          <dt>Deal exists</dt>
          <dd>{deal ? <span className="chip ok">Yes</span> : <span className="chip sealed">Not opened</span>}</dd>
          <dt>Stage</dt>
          <dd>{stage ?? '—'}</dd>
          <dt>Clearing price</dt>
          <dd>{clearingPrice ? `${fmtPct(clearingPrice)} of NAV` : <span className="chip sealed">sealed</span>}</dd>
        </dl>
        {!closed && (
          <p className="hint" style={{ marginTop: 12 }}>
            Live per-LP elections and sealed bids are not observed by the LPAC while the deal is in
            flight — only that the room exists. A scoped fairness view unlocks the moment the close
            settles.
          </p>
        )}
      </Card>

      {closed ? (
        <div className="stack g3">
          <Card title="Fairness disclosure">
            {disclosures.length ? (
              disclosures.map((d) => (
                <dl className="kv" key={d.contractId}>
                  <dt>Clearing %</dt>
                  <dd>{fmtPct(d.args.clearingPct)}</dd>
                  <dt>Total units</dt>
                  <dd>{String(d.args.totalUnits)}</dd>
                  <dt>Fairness hash</dt>
                  <dd className="mono">{String(d.args.fairnessHash)}</dd>
                </dl>
              ))
            ) : (
              <p className="hint">No FairnessDisclosure yet — created by ContinuationDeal.Close (Stream C).</p>
            )}
          </Card>
          <Card title="Settlement receipt">
            {receipts.length ? (
              receipts.map((r) => (
                <dl className="kv" key={r.contractId}>
                  <dt>Total units</dt>
                  <dd>{String(r.args.totalUnits)}</dd>
                </dl>
              ))
            ) : (
              <p className="hint">No SettlementReceipt yet — created by ContinuationDeal.Close (Stream C).</p>
            )}
          </Card>
        </div>
      ) : (
        <Card title="Before / after — scoped fairness window (illustrative)">
          <div className="ba">
            <div className="ba-col">
              <span className="ba-lab">Before close</span>
              <span className="ba-val before">Reference NAV {refNav ? fmtM(refNav) : '—'} held in the old fund. No per-LP holdings, bids, or elections visible.</span>
            </div>
            <div className="ba-arrow" aria-hidden="true">
              →
            </div>
            <div className="ba-col">
              <span className="ba-lab">After close (preview)</span>
              <span className="ba-val after">
                Aggregate cash / units / asset legs tie out to the {clearingPrice ? fmtPct(clearingPrice) : 'set'} clearing
                price, plus a fairness hash — never per-LP amounts. Not yet available: Close has no
                builder in this stream.
              </span>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
