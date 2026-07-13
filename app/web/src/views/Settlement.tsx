// Task 8 — the settlement "money-shot".
//
// The demo opens ONE browser window per role (gp, buyer, lpExiting, lpRolling,
// lpac). When the GP's single atomic Close lands, EVERY window flips to a
// full-screen SETTLED state showing the SAME shared identifier — on-screen proof
// it was ONE atomic transaction, not five staged animations.
//
// Each window learns of the close from ITS OWN party's real Canton projection:
// this component polls `reads.activeContracts(session.party, …)` (~1s) — never a
// shared UI flag. The shared, cross-window-identical value is the
// SettlementReceipt contractId: a contractId is globally unique and byte-identical
// in every party's projection, so gp + buyer + both LPs all render the SAME id.
// The LPAC seat is NOT in the deal `room` (it observes only the aggregate
// FairnessDisclosure — the ILPA scoped oversight view), so its window settles on
// that instead; the shared FACTS (dealId, clearing %, total units) are identical
// on both records, and the Close updateId (which is truly identical for all five)
// is a Task 9 enhancement via /v2/updates.
//
// SECURITY: read-only. No key material is touched, logged, persisted, or sent.
import { useEffect, useRef, useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { reads, R, DEMO } from '../lib/useLedger';
import { useSession, type Role } from '../state/WalletSession';
import { fmtM } from './shared';

const POLL_MS = 1000;

type Settled = {
  /** The shared settlement id shown big in every window (identical across parties). */
  sharedId: string;
  /** Whether the settlement artifact is the room receipt (vs the LPAC fairness view). */
  isReceipt: boolean;
  dealId: string;
  clearingPct: string;
  totalUnits: string;
  fairnessHash?: string;
};

/** This party's own settled outcome, read from its own post-close projection. */
function ownOutcome(role: Role | null, holdings: ActiveContract[], me: string): string {
  const sum = (instId: string) =>
    holdings
      .filter((c) => c.args.owner === me && c.args.instId === instId)
      .reduce((s, c) => s + Number(c.args.amount), 0);
  switch (role) {
    case 'buyer': {
      const units = sum(DEMO.unit);
      return units ? `+${units.toLocaleString()} CV units (${DEMO.unit})` : 'Units settled to your wallet';
    }
    case 'lpExiting': {
      const cash = sum(DEMO.usdc);
      return cash ? `+${cash.toLocaleString()} ${DEMO.usdc}` : 'Cash settled to your wallet';
    }
    case 'lpRolling':
      return 'Your position rolled into the new vehicle — no cash leg.';
    case 'gp':
      return 'One atomic Close moved every leg — signed by your custodian alone.';
    case 'lpac':
      return 'Fairness verified — aggregates + fairness anchor, never per-LP data.';
    default:
      return 'Settled.';
  }
}

/**
 * Overlays the role workspace: a slim "awaiting settlement" strip while the deal
 * is live, and a full-screen SETTLED takeover the moment this party's own
 * projection shows the close. Renders nothing pre-deal so the workspace is clean.
 */
export default function Settlement() {
  const { party, role } = useSession();
  const [settled, setSettled] = useState<Settled | null>(null);
  const [outcome, setOutcome] = useState<string>('');
  const settledRef = useRef(false);

  useEffect(() => {
    if (!party) return;
    let on = true;
    settledRef.current = false;
    setSettled(null);

    const forCv = (c: ActiveContract) => c.args.dealId === DEMO.cv;

    const poll = async () => {
      if (settledRef.current) return; // stop once settled
      try {
        const [receipts, disclosures, holdings] = await Promise.all([
          reads.activeContracts(party, { templateId: R.receipt }),
          reads.activeContracts(party, { templateId: R.disclosure }),
          reads.activeContracts(party, { templateId: R.holding }),
        ]);
        if (!on) return;

        // Prefer the room's SettlementReceipt (its cid is the shared proof value).
        // The LPAC is not in `room`, so fall back to its FairnessDisclosure.
        const receipt = receipts.filter(forCv).pop();
        const disclosure = disclosures.filter(forCv).pop();
        const artifact = receipt ?? disclosure;
        if (artifact) {
          settledRef.current = true;
          setOutcome(ownOutcome(role, holdings, party));
          setSettled({
            sharedId: artifact.contractId,
            isReceipt: !!receipt,
            dealId: String(artifact.args.dealId),
            clearingPct: String(artifact.args.clearingPct),
            totalUnits: String(artifact.args.totalUnits),
            fairnessHash: artifact.args.fairnessHash ? String(artifact.args.fairnessHash) : undefined,
          });
        }
      } catch {
        // Transient read errors are non-fatal — the next tick retries.
      }
    };

    void poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [party, role]);

  // Only the post-close SETTLED overlay is shown; deal state lives in the Stepper.
  if (!settled) return null;

  const clearingPctNum = Number(settled.clearingPct);
  const clearingLabel = Number.isFinite(clearingPctNum) ? `${(clearingPctNum * 100).toFixed(0)}%` : settled.clearingPct;

  return (
    <div className="settled-overlay" role="dialog" aria-label="Settlement complete" data-testid="settled">
      <div className="settled-inner">
        <span className="settled-eyebrow">Atomic close</span>
        <h1 className="settled-title">SETTLED</h1>

        <div className="settled-idblock">
          <span className="settled-idlabel">
            {settled.isReceipt ? 'Settlement receipt id' : 'Fairness disclosure id (LPAC scoped view)'}
          </span>
          <code className="settled-id mono" data-testid="settled-id">{settled.sharedId}</code>
        </div>

        <dl className="kv settled-facts">
          <dt>Deal</dt>
          <dd className="mono">{settled.dealId}</dd>
          <dt>Clearing price</dt>
          <dd>{clearingLabel} of NAV</dd>
          <dt>Total units</dt>
          <dd className="mono">{fmtM(settled.totalUnits)} ({Number(settled.totalUnits).toLocaleString()})</dd>
          {settled.fairnessHash && (
            <>
              <dt>Fairness hash</dt>
              <dd className="mono">{settled.fairnessHash}</dd>
            </>
          )}
        </dl>

        <div className="settled-outcome">
          <span className="settled-idlabel">Your outcome</span>
          <span className="settled-figure mono">{outcome}</span>
        </div>
      </div>
    </div>
  );
}
