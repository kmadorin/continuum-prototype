// Approval Queue — four-eyes release.
//
// The "queue" IS on-chain state: this role app polls ITS OWN per-party ACS for the
// contracts that need THIS party's signature to move forward — proposals addressed
// to it that it hasn't accepted. Each pending item is a REVIEWABLE card: the deal
// terms + this party's own economics + the custodian officer who must release the
// signature. "Approve & Sign" exercises the accept choice (the CUSTODY BACKEND signs
// with the session party's key) → the item disappears once accepted on-chain.
// "Reject" is a local dismiss (a real custodian would record a rejection; the demo
// notes that the item stays pending on-ledger).
//
// The four-eyes framing: the officer reviews the terms, THEN releases the key.
//
// SECURITY: read-only polling + action-via-backend. No key material in the browser.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, DEMO, positionNav, atClearing, shortParty, type SubmitResult } from '../lib/useLedger';
import { useSession } from '../state/WalletSession';
import { fmtM, fmtPct } from './shared';

// LPACConsentRequest is gp-signed / lpac-controlled; not in useLedger's T/R maps
// (the demo's LPAC seat creates LPACConsent directly), so we resolve it locally.
const CONSENT_REQ = { t: '#continuum-contracts:Continuum.Consent:LPACConsentRequest', r: 'Consent:LPACConsentRequest' };

export type Term = { label: string; value: string };

export type PendingItem = {
  /** Stable id (the contractId of the thing to sign, or a synthetic for choices). */
  id: string;
  /** Short kind label, e.g. "Execution delegation". */
  kind: string;
  title: string;
  terms: Term[];
  /** The accept/release action — the backend signs with this party's key. */
  approve: () => Promise<SubmitResult>;
  approveLabel: string;
};

const clearingLabel = (deal: ActiveContract | null): string =>
  deal?.args.clearingPrice ? `${fmtPct(deal.args.clearingPrice)} of NAV` : 'sealed — not yet set';

const dealTerms = (deal: ActiveContract | null): Term[] =>
  deal
    ? [
        { label: 'Fund', value: String(deal.args.fund ?? DEMO.fund) },
        { label: 'Continuation vehicle', value: String(deal.args.cv ?? DEMO.cv) },
        { label: 'Clearing price', value: clearingLabel(deal) },
      ]
    : [{ label: 'Continuation vehicle', value: DEMO.cv }];

/**
 * Poll this role's own ACS for the items awaiting its signature. Returns the live
 * list; `refresh()` re-reads on demand (call it after an approve so the item drops).
 */
export function usePendingApprovals(): { items: PendingItem[]; refresh: () => void } {
  const L = useLedger();
  const { role } = useSession();
  const [items, setItems] = useState<PendingItem[]>([]);
  const meRef = useRef(L.me);
  meRef.current = L.me;

  const build = useCallback(async (): Promise<PendingItem[]> => {
    const me = meRef.current;
    if (!me || !role) return [];
    const deal = (await L.myAcs(R.deal)).find((c) => c.args.cv === DEMO.cv) ?? null;

    const acceptDelegation = (prop: ActiveContract): PendingItem => ({
      id: prop.contractId,
      kind: 'Execution delegation',
      title: 'Pre-authorize the GP to settle your leg at Close',
      terms: [
        ...dealTerms(deal),
        { label: 'Your authorization', value: 'GP may move your leg inside the atomic Close only' },
      ],
      approveLabel: 'Approve & Sign delegation',
      approve: () =>
        L.submit(
          [{ ExerciseCommand: { templateId: T.execDelegProp, contractId: prop.contractId, choice: 'EDP_Accept', choiceArgument: {} } }],
          R.execDeleg,
        ),
    });

    switch (role) {
      case 'buyer': {
        const props = (await L.myAcs(R.execDelegProp)).filter((c) => c.args.party === me);
        return props.map((p) => ({
          ...acceptDelegation(p),
          terms: [...dealTerms(deal), { label: 'Unit leg you receive', value: `${fmtM(DEMO.buyerUnits)} (${DEMO.unit})` }],
        }));
      }
      // Both LPs leave the old fund — one for cash, one for units — so both queues carry
      // the same two approvals: the delegation, and the old-fund interest the Close burns.
      // Only the leg they receive differs.
      case 'lpExiting':
      case 'lpRolling': {
        const rolling = role === 'lpRolling';
        const [props, offers] = await Promise.all([L.myAcs(R.execDelegProp), L.myAcs(R.interestOffer)]);
        const clearing = deal?.args.clearingPrice != null ? Number(deal.args.clearingPrice) : Number(DEMO.clearingPct);
        const leg = rolling
          ? {
              label: 'Rolled-unit leg you receive',
              value: `${atClearing(positionNav('lpRolling'), clearing).toLocaleString()} (${DEMO.unit})`,
            }
          : { label: 'Cash leg you receive', value: `${fmtM(DEMO.cashAmt)} (${DEMO.usdc})` };
        const out: PendingItem[] = props
          .filter((c) => c.args.party === me)
          .map((p) => ({ ...acceptDelegation(p), terms: [...dealTerms(deal), leg] }));
        for (const offer of offers.filter((c) => c.args.lp === me)) {
          out.push({
            id: offer.contractId,
            kind: 'Old-fund interest',
            title: rolling
              ? 'Accept the old-fund interest the Close burns as your rolled units are issued'
              : 'Accept the old-fund interest the Close will burn for your cash',
            terms: [
              ...dealTerms(deal),
              { label: 'Position NAV', value: fmtM(offer.args.nav) },
              { label: 'Offered by', value: shortParty(String(offer.args.oldFund)) },
            ],
            approveLabel: 'Approve & Sign interest',
            approve: () =>
              L.submit(
                [{ ExerciseCommand: { templateId: T.interestOffer, contractId: offer.contractId, choice: 'OFI_Accept', choiceArgument: {} } }],
                R.interest,
              ),
          });
        }
        return out;
      }
      case 'lpac': {
        const out: PendingItem[] = [];
        // The deal's RecordConsent step (lpac-controlled) while it is at Setup.
        if (deal && deal.args.stage === 'Setup') {
          out.push({
            id: `record-consent:${deal.contractId}`,
            kind: 'Governance',
            title: 'Record LPAC consent so the room can open elections',
            terms: [...dealTerms(deal), { label: 'Effect', value: 'Advances the deal Setup → Consented' }],
            approveLabel: 'Approve & Sign consent',
            approve: () =>
              L.submit(
                [{ ExerciseCommand: { templateId: T.deal, contractId: deal.contractId, choice: 'RecordConsent', choiceArgument: {} } }],
                R.deal,
              ),
          });
        }
        // A pending LPACConsentRequest addressed to this LPAC (gp-signed).
        const reqs = (await L.myAcs(CONSENT_REQ.r).catch(() => [])).filter((c) => c.args.lpac === me);
        for (const req of reqs) {
          out.push({
            id: req.contractId,
            kind: 'Conflict waiver',
            title: 'Grant the conflict waiver for the close',
            terms: [...dealTerms(deal), { label: 'Recusals on record', value: String((req.args.recusals as unknown[])?.length ?? 0) }],
            approveLabel: 'Approve & Sign waiver',
            approve: () =>
              L.submit(
                [{ ExerciseCommand: { templateId: CONSENT_REQ.t, contractId: req.contractId, choice: 'Grant', choiceArgument: { bidMarkerCids: [] } } }],
                R.consent,
              ),
          });
        }
        return out;
      }
      default:
        return [];
    }
  }, [L, role]);

  const refresh = useCallback(() => {
    let ok = true;
    void build()
      .then((next) => {
        if (ok) setItems(next);
      })
      .catch(() => {
        /* transient read error — next tick retries */
      });
    return () => {
      ok = false;
    };
  }, [build]);

  useEffect(() => {
    let on = true;
    const tick = () => {
      build()
        .then((next) => {
          if (on) setItems(next);
        })
        .catch(() => {});
    };
    tick();
    const id = setInterval(tick, 2000);
    return () => {
      on = false;
      clearInterval(id);
    };
  }, [build]);

  return { items, refresh };
}

/** The Approvals tab: reviewable four-eyes cards for the items awaiting this party. */
export default function ApprovalQueue() {
  const { items, refresh } = usePendingApprovals();
  const { custodianName } = useSession();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);

  const visible = items.filter((i) => !dismissed.has(i.id));

  const approve = async (item: PendingItem) => {
    setBusy(item.id);
    try {
      await item.approve(); // toast (with clickable updateId) is fired by L.submit
      refresh(); // the accepted contract drops from this party's ACS
    } catch {
      /* the toast surfaced the error */
    } finally {
      setBusy(null);
    }
  };

  const reject = (id: string) => setDismissed((s) => new Set(s).add(id));

  if (!visible.length) {
    return (
      <div className="taskq">
        <div className="taskq-head">
          <span className="tq-title">Approval queue</span>
          <span className="tq-n zero">0</span>
        </div>
        <div className="taskq-empty">Nothing awaiting your signature — this queue reacts to on-chain state.</div>
      </div>
    );
  }

  return (
    <div className="stack g4">
      <div className="taskq">
        <div className="taskq-head">
          <span className="tq-title">Approval queue · four-eyes release</span>
          <span className="tq-n">{visible.length}</span>
        </div>
      </div>

      {visible.map((item) => (
        <div className="card approval-card" key={item.id} data-testid="approval-card">
          <div className="approval-top">
            <span className="badge-action">{item.kind}</span>
            <h2 style={{ margin: 0 }}>{item.title}</h2>
          </div>

          <dl className="kv">
            {item.terms.map((t) => (
              <div style={{ display: 'contents' }} key={t.label}>
                <dt>{t.label}</dt>
                <dd className={/NAV|leg|price|\$/.test(t.value) ? 'mono' : undefined}>{t.value}</dd>
              </div>
            ))}
          </dl>

          <p className="approval-officer">
            Requires <b>{custodianName ?? 'custodian'}</b> officer approval — reviewing the terms releases your
            key's signature.
          </p>

          <div className="actions">
            <button className="btn" type="button" disabled={busy === item.id} onClick={() => approve(item)}>
              {busy === item.id ? 'Signing…' : item.approveLabel}
            </button>
            <button className="btn ghost" type="button" disabled={busy === item.id} onClick={() => reject(item.id)}>
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
