// Independent Valuer (role `valuer`) — Kroll Valuation Services. The 6th seat, and
// the ROOT of the provenance chain: it signs and anchors the ValuationReport whose
// `contentHash` (= the real sha256 of the served valuation PDF) every other seat
// verifies on the Valuation tab. One action only:
//
//   Sign & anchor the independent valuation → create Continuum.Valuation:ValuationReport
//     agent = L.me (the valuer, MUST differ from gp) · gp = counter.gp
//     navLow/navHigh = DEMO.navLow/navHigh · asOfDate = DEMO.closeDate
//     contentHash = DEMO.contentHash (VALUATION_SHA256)
//
// The report is `signatory agent, observer gp` on-ledger, so once anchored the GP
// observes it and its settlement antecedent-DAG (Advisor) resolves the valuation.
// After it exists in this party's ACS the screen is read-only: "anchored ✓".
//
// SECURITY: read-only polling + a single custody-signed create. No key material.
import { useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, counter, DEAL_ID, DEMO, shortParty } from '../lib/useLedger';
import { truncHash } from '../lib/docs';
import { Card, fmtM } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

const DOC_NAME = 'valuation-report';

export default function Valuer() {
  const L = useLedger();
  const { busy, err, note, run } = useAction();
  const [report, setReport] = useState<ActiveContract | null>(null);

  const refresh = async (alive: () => boolean = () => true) => {
    const v = await L.myAcs(R.valuation);
    if (!alive()) return;
    setReport(pick(v, (c) => c.args.dealId === DEAL_ID));
  };
  useRefresh(refresh, [L.me]);

  const anchor = () =>
    run('anchor', async () => {
      await L.submit(
        [
          {
            CreateCommand: {
              templateId: T.valuation,
              createArguments: {
                agent: L.me,
                gp: counter.gp,
                dealId: DEAL_ID,
                navLow: DEMO.navLow,
                navHigh: DEMO.navHigh,
                asOfDate: DEMO.closeDate,
                contentHash: DEMO.contentHash,
              },
            },
          },
        ],
        R.valuation,
      );
      await refresh();
      return 'Independent valuation anchored — its sha256 is now the on-ledger reference every seat verifies.';
    });

  const navLow = Number(DEMO.navLow);
  const navHigh = Number(DEMO.navHigh);
  const mid = (navLow + navHigh) / 2;
  const anchored = !!report;
  const anchoredHash = (report?.args.contentHash as string) || DEMO.contentHash;

  return (
    <Card title="Independent Valuation Agent · Kroll Valuation Services">
      <div className="stack g3">
        {/* It used to say the GP, buyer, LPs and LPAC "each verify" this document. They cannot:
            ValuationReport is `signatory agent, observer gp`, so the report reaches the GP and
            nobody else. Claiming an audience the projection does not give it is the one thing a
            seat about verifiable anchoring must not do. */}
        <p className="hint" style={{ marginTop: 0 }}>
          You are the independent agent. The GP opened the closing room for Project Continuum CV I, L.P. —
          that is the request for your independent valuation. Your sole action is to respond: sign and anchor
          the NAV range. The on-ledger <span className="mono">contentHash</span> below is what the GP verifies
          against the served document — your Canton signature is the anchor.
        </p>

        <dl className="kv">
          <dt>Signed in as</dt>
          <dd className="mono">{shortParty(L.me)}</dd>
          <dt>Independent NAV range</dt>
          <dd className="mono">
            {fmtM(navLow)} – {fmtM(navHigh)}
          </dd>
          <dt>Headline NAV (mid)</dt>
          <dd className="mono">{fmtM(mid)}</dd>
          <dt>Valuation as of</dt>
          <dd className="mono">{DEMO.closeDate}</dd>
          <dt>Report</dt>
          <dd>
            <a className="link-mono" href={`/docs/${DOC_NAME}`} target="_blank" rel="noopener noreferrer">
              View valuation report →
            </a>
          </dd>
        </dl>

        {anchored ? (
          <div className="stack g3">
            <span className="chip ok">Valuation anchored ✓</span>
            <p className="hint" style={{ margin: 0 }}>
              sha256 <span className="mono">{truncHash(anchoredHash)}</span> · verify it on the Valuation tab. This
              seat is now read-only — the anchor is immutable on-ledger.
            </p>
          </div>
        ) : (
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy} onClick={anchor}>
              {busy === 'anchor' ? 'Signing…' : 'Sign & anchor the independent valuation'}
            </button>
            <span className="cant-see">Signed by your custodian — the agent party differs from the GP by construction.</span>
          </div>
        )}

        <ErrNote err={err} note={note} />
      </div>
    </Card>
  );
}
