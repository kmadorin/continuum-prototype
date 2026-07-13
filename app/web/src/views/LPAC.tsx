// LPAC oversight (role `lpac`) — the governance / verification seat (State Street).
// Its journey is a REVIEW QUEUE, not a button list:
//   1. Review the deal-formation documents side by side — the Valuation Report
//      (signed by the independent valuer, Kroll) and the Fairness Opinion (signed
//      here). Each: title · signer · hash chip · Verify-on-ledger · View.
//   2. Sign the Fairness Opinion (the LPAC's own attestation, contentHash =
//      FAIRNESS_SHA256) and grant the conflict waiver the Close consumes.
//   3. Record LPAC consent — the four-eyes release lives in the Approval queue
//      (Overview tab); it advances the deal Setup → Consented.
//   4. Once consent is recorded the seat flips to READ-ONLY "oversight mode":
//      supervision is complete and time-stamped on-ledger.
//
// The Valuation Report is created by the VALUER (Kroll) now, not here — the LPAC
// only reviews/verifies it. Reads (its scoped oversight window): the deal,
// SettlementReceipt, FairnessDisclosure.
import { useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, counter, DEAL_ID, DEMO, shortParty } from '../lib/useLedger';
import { useSession } from '../state/WalletSession';
import { HashChip, VerifyBadge, useVerify } from '../components/DocVerify';
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

// `embedded` mounts only the cards for a given Deal Page tab (dropping the
// standalone StageHead + deal-summary chrome the page already renders). RecordConsent
// itself lives in the four-eyes Approval queue, not here.
export type LpacSection = 'governance' | 'window';

// A single reviewable document row inside the LPAC review queue — owns its own
// verify state (so the two docs verify independently) and renders the hash chip +
// View + Verify affordances the oversight seat needs.
function ReviewDoc({
  docName,
  title,
  signer,
  hash,
  anchored,
}: {
  docName: string;
  title: string;
  signer: string;
  hash: string;
  anchored: boolean;
}) {
  const { state, result, run } = useVerify(docName);
  return (
    <div className="card review-doc" data-testid="review-doc">
      <div className="stack g2">
        <div className="rd-head">
          <span className="chip ok val-badge">{anchored ? 'Anchored' : 'Not yet anchored'}</span>
          <span className="ph-meta mono">{docName}</span>
        </div>
        <div className="doc-title">{title}</div>
        <div className="doc-meta mono">Signed by {signer}</div>
        <div className="doc-hash-row">
          <span className="doc-hash-lab">sha256</span>
          <HashChip hash={hash} />
        </div>
        <div className="doc-actions">
          <a className="btn ghost sm" href={`/docs/${docName}`} target="_blank" rel="noopener noreferrer">
            View
          </a>
          <button type="button" className="btn ghost sm" onClick={run} disabled={state === 'loading'}>
            {state === 'loading' ? 'Verifying…' : 'Verify on-ledger'}
          </button>
          <VerifyBadge state={state} result={result} />
        </div>
      </div>
    </div>
  );
}

export default function LPAC({ embedded }: { embedded?: LpacSection[] } = {}) {
  const bare = !!embedded;
  const show = (s: LpacSection) => !embedded || embedded.includes(s);
  const L = useLedger();
  const { custodianName } = useSession();
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

  // The Fairness Opinion is the LPAC's OWN attestation (provider = lpac). Its
  // contentHash is the real sha256 of the served fairness document (FAIRNESS_SHA256),
  // so the Verify-on-ledger on this doc MATCHES. The Valuation Report is now signed
  // by the valuer (Kroll) — the LPAC only reviews/verifies it.
  const signFairness = () =>
    run('fairness', async () => {
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
                contentHash: DEMO.fairnessContentHash,
              },
            },
          },
        ],
        R.opinion,
      );
      await refresh();
      return 'Fairness opinion signed and anchored — its sha256 matches the served document on Verify.';
    });

  const stage = (deal?.args.stage as string) ?? null;
  const closed = receipts.length > 0 || stage === 'Closed';
  // RecordConsent (four-eyes release in the Approval queue) advances Setup → Consented.
  // Once past Setup the LPAC's oversight is complete and time-stamped on-ledger.
  const consentRecorded = !!stage && stage !== 'Setup';
  const valuerName = 'Kroll Valuation Services';
  const lpacName = custodianName ?? 'State Street — LPAC';

  return (
    <div className="stack g4">
      {!bare && (
        <StageHead
          tag="OVERSIGHT"
          role="LPAC"
          title="Verify it was fair"
          lede="The governance seat. You review the deal-formation documents, record consent via your custodian's four-eyes release, and get a scoped window to verify the settled close — without ever seeing the live per-LP inputs."
        />
      )}

      {!bare && (
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
      )}

      {show('governance') && (
        <div className="stack g4">
          {consentRecorded && (
            <div className="callout" data-testid="oversight-mode">
              <div className="ct">Oversight mode — consent recorded {DEMO.closeDate}</div>
              <p>
                LPAC's supervision is complete and time-stamped on-ledger. Your consent advanced the deal to{' '}
                <span className="mono">{stage}</span>; this seat is now read-only. You continue to verify the
                documents below and, after Close, the scoped fairness window.
              </p>
            </div>
          )}

          <div className="panel">
            <div className="panel-head">
              <h2>Review queue — deal formation</h2>
              <span className="ph-meta">{consentRecorded ? 'read-only' : 'awaiting your consent'}</span>
            </div>
            <div className="panel-body">
              <div className="review-cols">
                <ReviewDoc
                  docName="valuation-report"
                  title="Valuation Report — Project Continuum CV I, L.P."
                  signer={valuerName}
                  hash={DEMO.contentHash}
                  anchored={!!valuation}
                />
                <ReviewDoc
                  docName="fairness-opinion"
                  title="Fairness Opinion — Project Continuum CV I, L.P."
                  signer={lpacName}
                  hash={DEMO.fairnessContentHash}
                  anchored={!!opinion}
                />
              </div>

              {!consentRecorded && (
                <div className="stack g3" style={{ marginTop: 16 }}>
                  <div className="actions">
                    <button className="btn" type="button" disabled={!!busy || !!opinion} onClick={signFairness}>
                      {opinion ? 'Fairness opinion signed ✓' : busy === 'fairness' ? 'Signing…' : 'Sign fairness opinion'}
                    </button>
                    <button className="btn ghost" type="button" disabled={!!busy || !!consent} onClick={grantConsent}>
                      {consent ? 'Conflict waiver on record ✓' : busy === 'grant' ? 'Signing…' : 'Grant conflict waiver'}
                    </button>
                  </div>
                  <p className="hint" style={{ margin: 0 }}>
                    Then record LPAC consent from your <b>Approval queue</b> below — the four-eyes release
                    advances the deal so the GP can open elections.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {show('window') && (
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
      )}

      <ErrNote err={err} note={note} />
    </div>
  );
}
