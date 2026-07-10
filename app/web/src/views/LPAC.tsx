// LPAC oversight (role `lpac`) — the governance / verification seat. Signs its
// OWN wallet for the choices that are lpac-controlled in the deployed 1.1.0:
//   • Record consent   → RecordConsent on the deal (moves Setup→Consented so elections can open)
//   • Grant consent     → create Continuum.Consent:LPACConsent (granted = true)
//   • Attest fairness   → create ValuationReport + FairnessOpinion (agent = lpac)
// Reads (its scoped oversight window): the deal, SettlementReceipt, FairnessDisclosure.
import { useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, counter, DEAL_ID, DEMO, shortParty } from '../lib/useLedger';
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

export default function LPAC() {
  const L = useLedger();
  const { busy, err, note, run } = useAction();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [consent, setConsent] = useState<ActiveContract | null>(null);
  const [valuation, setValuation] = useState<ActiveContract | null>(null);
  const [opinion, setOpinion] = useState<ActiveContract | null>(null);
  const [receipts, setReceipts] = useState<ActiveContract[]>([]);
  const [disclosures, setDisclosures] = useState<ActiveContract[]>([]);

  const refresh = async (alive: () => boolean = () => true) => {
    const [d, c, v, o, r, f] = await Promise.all([
      L.myAcs(R.deal),
      L.myAcs(R.consent),
      L.myAcs(R.valuation),
      L.myAcs(R.opinion),
      L.myAcs(R.receipt),
      L.myAcs(R.disclosure),
    ]);
    if (!alive()) return;
    setDeal(pick(d));
    setConsent(pick(c, (x) => x.args.dealId === DEAL_ID));
    setValuation(pick(v, (x) => x.args.dealId === DEAL_ID));
    setOpinion(pick(o, (x) => x.args.dealId === DEAL_ID));
    setReceipts(r);
    setDisclosures(f);
  };
  useRefresh(refresh, [L.me]);

  const recordConsent = () =>
    run('record', async () => {
      if (!deal) throw new Error('No deal in your scope yet — the GP opens the closing room first.');
      await L.submit(
        [{ ExerciseCommand: { templateId: T.deal, contractId: deal.contractId, choice: 'RecordConsent', choiceArgument: {} } }],
        R.deal,
      );
      await refresh();
      return 'Consent recorded — the deal advances to Consented so the GP can open elections.';
    });

  const grantConsent = () =>
    run('grant', async () => {
      await L.submit(
        [
          {
            CreateCommand: {
              templateId: T.consent,
              createArguments: { gp: counter.gp, lpac: L.me, dealId: DEAL_ID, recusals: [], granted: true },
            },
          },
        ],
        R.consent,
      );
      await refresh();
      return 'LPAC consent granted — conflict waiver on record for the close.';
    });

  const attest = () =>
    run('attest', async () => {
      await L.submit([
        {
          CreateCommand: {
            templateId: T.valuation,
            createArguments: {
              agent: L.me,
              gp: counter.gp,
              dealId: DEAL_ID,
              navLow: '4000000.0',
              navHigh: '6000000.0',
              asOfDate: DEMO.closeDate,
              contentHash: DEMO.contentHash,
            },
          },
        },
      ]);
      await L.submit(
        [
          {
            CreateCommand: {
              templateId: T.opinion,
              createArguments: {
                provider: L.me,
                gp: counter.gp,
                lpac: L.me,
                dealId: DEAL_ID,
                fairLow: '0.9',
                fairHigh: '1.0',
                opinionDate: DEMO.closeDate,
                contentHash: DEMO.contentHash,
              },
            },
          },
        ],
        R.opinion,
      );
      await refresh();
      return 'Valuation report + fairness opinion attested — the antecedent gate the Close validates.';
    });

  const stage = (deal?.args.stage as string) ?? null;
  const closed = receipts.length > 0 || stage === 'Closed';

  return (
    <div className="stack g4">
      <StageHead
        tag="OVERSIGHT"
        role="LPAC"
        title="Verify it was fair"
        lede="The governance seat. You record consent and attest fairness with your own wallet, and get a scoped window to verify the settled close — without ever seeing the live per-LP inputs."
      />

      <Card title={deal ? (deal.args.cv as string) : 'No deal in scope yet'}>
        <dl className="kv">
          <dt>Signed in as</dt>
          <dd className="mono">{shortParty(L.me)}</dd>
          <dt>Stage</dt>
          <dd>{stage ?? <span className="chip pending">not opened</span>}</dd>
          <dt>Clearing price</dt>
          <dd>{deal?.args.clearingPrice ? `${fmtPct(deal.args.clearingPrice)} of NAV` : <span className="chip sealed">sealed</span>}</dd>
          <dt>Reference NAV</dt>
          <dd>{deal ? fmtM(deal.args.refNav) : '—'}</dd>
        </dl>
      </Card>

      <Card title="Governance actions">
        <div className="stack g3">
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy || !deal || stage !== 'Setup'} onClick={recordConsent}>
              {busy === 'record' ? 'Signing…' : 'Record consent'}
            </button>
            {stage && stage !== 'Setup' && <span className="chip ok">Consent recorded</span>}
          </div>
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy || !!consent} onClick={grantConsent}>
              {consent ? 'Consent granted ✓' : busy === 'grant' ? 'Signing…' : 'Grant LPAC consent'}
            </button>
          </div>
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy || (!!valuation && !!opinion)} onClick={attest}>
              {valuation && opinion ? 'Fairness attested ✓' : busy === 'attest' ? 'Signing…' : 'Attest valuation + fairness'}
            </button>
          </div>
        </div>
      </Card>

      <Card title="Scoped fairness window">
        {closed ? (
          <div className="stack g3">
            {disclosures.length ? (
              disclosures.map((d) => (
                <dl className="kv" key={d.contractId}>
                  <dt>Clearing %</dt>
                  <dd>{fmtPct(d.args.clearingPct)}</dd>
                  <dt>Total units</dt>
                  <dd className="mono">{String(d.args.totalUnits)}</dd>
                  <dt>Fairness hash</dt>
                  <dd className="mono">{String(d.args.fairnessHash)}</dd>
                </dl>
              ))
            ) : (
              <p className="hint">Close settled — no FairnessDisclosure in your projection yet.</p>
            )}
            {receipts.map((r) => (
              <dl className="kv" key={r.contractId}>
                <dt>Settlement receipt — units</dt>
                <dd className="mono">{String(r.args.totalUnits)}</dd>
                <dt>Clearing %</dt>
                <dd>{fmtPct(r.args.clearingPct)}</dd>
              </dl>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 0 }}>
            Before the close you see only that a deal exists — never the live sealed bids or per-LP elections.
            The scoped fairness view (SettlementReceipt + FairnessDisclosure) unlocks the moment the GP's atomic
            Close settles.
          </p>
        )}
      </Card>

      <ErrNote err={err} note={note} />
    </div>
  );
}
