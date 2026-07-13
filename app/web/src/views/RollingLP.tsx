// Rolling LP (role `lpRolling`) — the investor staying in. Its custodian signs:
//   • Elect to roll     → create Continuum.Election:LPElection (rollNav = positionNav, peer-blind)
//   • Accept delegation → EDP_Accept on its ExecDelegationProposal
//   • Accept interest   → OFI_Accept on its OldFundInterestOffer (gp offers → lp accepts)
//   • Propose participation → create DealParticipation (lp proposes → gp accepts)
// The mirror of the Exiting LP: it rolls instead of selling, but it leaves the OLD fund
// just the same — so it owes the close the same pre-signed authority. Without the
// interest + participation pair the Close has nothing to burn, and the roller's old
// position would survive its own rollover.
import { useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, counter, DEAL_ID, DEMO, positionNav, atClearing, shortParty } from '../lib/useLedger';
import HoldingReceipt from '../components/HoldingReceipt';
import SellVsRoll from '../components/SellVsRoll';
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

// $200.0M — this seat's own stake record. With the exiting LP's $300M it sums to the deal's
// $500M reference NAV, so the units the close mints are exactly what this screen promises.
// An LP does not observe the independent ValuationReport, so it is never labelled "independent".
const POSITION_NAV = String(positionNav('lpRolling'));

// `embedded` mounts only the cards for a given Deal Page tab (dropping the
// standalone StageHead + deal-summary chrome the page already renders).
export type LpSection = 'election' | 'preauth' | 'holding';

export default function RollingLP({ embedded }: { embedded?: LpSection[] } = {}) {
  const bare = !!embedded;
  const show = (s: LpSection) => !embedded || embedded.includes(s);
  const L = useLedger();
  const { busy, err, note, run } = useAction();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [election, setElection] = useState<ActiveContract | null>(null);
  const [prop, setProp] = useState<ActiveContract | null>(null);
  const [deleg, setDeleg] = useState<ActiveContract | null>(null);
  const [offer, setOffer] = useState<ActiveContract | null>(null);
  const [interest, setInterest] = useState<ActiveContract | null>(null);
  const [participation, setParticipation] = useState<ActiveContract | null>(null);
  const [units, setUnits] = useState<number>(0);
  const [holding, setHolding] = useState<ActiveContract | null>(null);

  const refresh = async (alive: () => boolean = () => true) => {
    const [d, el, p, dg, of, it, dp, h] = await Promise.all([
      L.myAcs(R.deal),
      L.myAcs(R.election),
      L.myAcs(R.execDelegProp),
      L.myAcs(R.execDeleg),
      L.myAcs(R.interestOffer),
      L.myAcs(R.interest),
      L.myAcs(R.dealPart),
      L.myAcs(R.holding),
    ]);
    if (!alive()) return;
    setDeal(pick(d));
    setElection(pick(el, (c) => c.args.lp === L.me));
    setProp(pick(p, (c) => c.args.party === L.me));
    setDeleg(pick(dg, (c) => c.args.party === L.me));
    setOffer(pick(of, (c) => c.args.lp === L.me));
    setInterest(pick(it, (c) => c.args.lp === L.me));
    setParticipation(pick(dp, (c) => c.args.lp === L.me));
    const mine = h.filter((c) => c.args.owner === L.me && c.args.instId === DEMO.unit);
    setUnits(mine.reduce((s, c) => s + Number(c.args.amount), 0));
    setHolding(pick(mine));
  };
  useRefresh(refresh, [L.me]);

  // Projection-safe economics: read the clearing price + reference NAV straight off
  // the room-visible ContinuationDeal — never a DEMO constant. Sealed until the GP
  // sets them.
  const clearingPct = deal?.args.clearingPrice != null ? Number(deal.args.clearingPrice) : null;
  const refNav = deal?.args.refNav != null ? Number(deal.args.refNav) : null;
  /** Settled from this seat's OWN projection: the deal is Closed, or the units have landed. */
  const closed = deal?.args.stage === 'Closed' || units > 0;

  // Election + contentless marker in ONE transaction — see ExitingLP: the GP learns THAT you
  // filed (ElectionFiled), never the roll/sell split (LPElection, which has no observers).
  const electRoll = () =>
    run('elect', async () => {
      await L.submit(
        [
          {
            CreateCommand: {
              templateId: T.election,
              createArguments: {
                lp: L.me,
                dealId: DEAL_ID,
                positionNav: POSITION_NAV,
                rollNav: POSITION_NAV,
                sellNav: '0.0',
                disclosureHash: DEMO.contentHash,
              },
            },
          },
          {
            CreateCommand: {
              templateId: T.electionFiled,
              createArguments: { lp: L.me, gp: counter.gp, dealId: DEAL_ID },
            },
          },
        ],
        R.election,
      );
      await refresh();
      return 'Roll election signed — peer-blind; the GP sees only that you filed, never the amount.';
    });

  const acceptDelegation = () =>
    run('deleg', async () => {
      if (!prop) throw new Error('No ExecDelegationProposal addressed to you yet — the GP proposes it first.');
      await L.submit(
        [{ ExerciseCommand: { templateId: T.execDelegProp, contractId: prop.contractId, choice: 'EDP_Accept', choiceArgument: {} } }],
        R.execDeleg,
      );
      await refresh();
      return 'Execution delegation accepted.';
    });

  // The old-fund interest the close burns when the roll settles: the GP offers it, this
  // seat co-signs. Rolling out of the old fund still means leaving the old fund.
  const acceptOffer = () =>
    run('offer', async () => {
      if (!offer) throw new Error('No OldFundInterestOffer addressed to you yet — the GP offers it first.');
      await L.submit(
        [{ ExerciseCommand: { templateId: T.interestOffer, contractId: offer.contractId, choice: 'OFI_Accept', choiceArgument: {} } }],
        R.interest,
      );
      await refresh();
      return 'Old-fund interest accepted — co-signed, and burned by the atomic Close.';
    });

  const proposeParticipation = () =>
    run('part', async () => {
      await L.submit(
        [{ CreateCommand: { templateId: T.dealPart, createArguments: { gp: counter.gp, lp: L.me } } }],
        R.dealPart,
      );
      await refresh();
      return 'Participation proposed — the GP accepts it to complete the burn authority.';
    });

  return (
    <div className="stack g4">
      {!bare && (
        <StageHead
          tag="INVESTOR — STAYING"
          role="Rolling LP"
          title="Roll into the new vehicle"
          lede="You decide to stay in at the room's clearing price — signed by your custodian, blind to every other LP. Your rolled units settle inside the GP's one atomic Close."
        />
      )}

      {!bare && (
        <Card title={deal ? (deal.args.cv as string) : 'Deal — not yet visible to you'}>
          <dl className="kv">
            <dt>Signed in as</dt>
            <dd className="mono">{shortParty(L.me)}</dd>
            <dt>Clearing price</dt>
            <dd>
              {deal?.args.clearingPrice ? `${fmtPct(deal.args.clearingPrice)} of NAV` : <span className="chip sealed">sealed — not yet set</span>}
            </dd>
            <dt>Your position</dt>
            <dd>{fmtM(POSITION_NAV)} NAV</dd>
          </dl>
        </Card>
      )}

      {show('election') && (
        <div className="stack g4">
          <Card title="My position">
            <dl className="kv">
              <dt>Stake (your record)</dt>
              <dd className="mono">{fmtM(POSITION_NAV)}</dd>
              <dt>Reference NAV (deal record)</dt>
              <dd className="mono">{refNav != null ? fmtM(refNav) : <span className="chip sealed">not on deal yet</span>}</dd>
              <dt>If you roll</dt>
              <dd className="mono">
                {clearingPct != null ? (
                  `${atClearing(Number(POSITION_NAV), clearingPct).toLocaleString()} CV units @ $1.00`
                ) : (
                  <span className="chip sealed">sealed — clearing not set</span>
                )}
              </dd>
              <dt>If you sell</dt>
              <dd className="mono">
                {clearingPct != null ? (
                  `${fmtM(atClearing(Number(POSITION_NAV), clearingPct))} cash`
                ) : (
                  <span className="chip sealed">sealed — clearing not set</span>
                )}
              </dd>
            </dl>
          </Card>

          {clearingPct != null ? (
            <SellVsRoll stakeNav={Number(POSITION_NAV)} clearingPct={clearingPct} />
          ) : (
            <div className="callout">
              <div className="ct">Sell vs roll — waiting on the clearing price</div>
              <p>The room sets the clearing price before you weigh roll vs sell. Your comparison unlocks the moment it's disclosed on the deal record — figures stay sealed until then.</p>
            </div>
          )}

          <Card title="Elect: roll over">
            {election ? (
              <div className="stack g3">
                <span className="chip ok">Election filed — Roll {fmtM(election.args.rollNav)}</span>
                <span className="cant-see">Peer-blind: no other LP's projection contains this election.</span>
              </div>
            ) : (
              <div className="actions">
                <button className="btn primary" type="button" disabled={!!busy} onClick={electRoll}>
                  {busy === 'elect' ? 'Signing…' : 'Elect to roll'}
                </button>
                <span className="cant-see">Signed by your custodian — blind to every other LP.</span>
              </div>
            )}
          </Card>
        </div>
      )}

      {show('preauth') &&
        // Once the close has settled, every pre-authorization has been CONSUMED by it — the
        // offer and the participation proposal are archived, which would otherwise read as
        // "waiting on the GP" forever. Say what actually happened instead of offering the
        // buttons again.
        (closed ? (
          <Card title="Pre-authorize the close">
            <div className="stack g3">
              <span className="chip ok">Pre-authorization consumed by the close ✓</span>
              <span className="hint">
                Your delegation and your old-fund interest were spent inside the atomic Close — the old
                position was burned in the same transaction that issued your rolled units.
              </span>
            </div>
          </Card>
        ) : (
          <Card title="Pre-authorize the close">
            <div className="stack g3">
              <div className="actions">
                <button className="btn" type="button" disabled={!!busy || !!deleg || !prop} onClick={acceptDelegation}>
                  {deleg ? 'Delegation accepted ✓' : busy === 'deleg' ? 'Signing…' : 'Accept execution delegation'}
                </button>
                {!prop && !deleg && <span className="hint">Waiting on the GP's delegation proposal.</span>}
              </div>
              <div className="actions">
                <button className="btn" type="button" disabled={!!busy || !!interest || !offer} onClick={acceptOffer}>
                  {interest ? 'Old-fund interest accepted ✓' : busy === 'offer' ? 'Signing…' : 'Accept interest offer'}
                </button>
                {!offer && !interest && <span className="hint">Waiting on the GP's old-fund interest offer.</span>}
              </div>
              <div className="actions">
                <button className="btn" type="button" disabled={!!busy || !!participation} onClick={proposeParticipation}>
                  {participation ? 'Participation proposed ✓' : busy === 'part' ? 'Signing…' : 'Propose participation'}
                </button>
                <span className="hint">Your old position is burned as the rolled units are issued — one transaction.</span>
              </div>
            </div>
          </Card>
        ))}

      {show('holding') &&
        (units > 0 && holding ? (
          <HoldingReceipt
            amount={units}
            clearingPct={Number(deal?.args.clearingPrice ?? DEMO.clearingPct)}
            metaHash={(holding.args.meta_ as Record<string, string> | undefined)?.['continuum/valuation-sha256'] ?? ''}
            title="My rolled holding"
          />
        ) : (
          <Card title="My rolled holding">
            <dl className="kv">
              <dt>Rolled CV units ({DEMO.unit})</dt>
              <dd className="mono">
                <span className="chip pending">none yet — settles at Close</span>
              </dd>
            </dl>
          </Card>
        ))}

      <ErrNote err={err} note={note} />
    </div>
  );
}
