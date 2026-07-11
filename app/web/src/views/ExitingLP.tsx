// Exiting LP (role `lpExiting`) — the investor cashing out. Its custodian signs:
//   • Elect to sell     → create Continuum.Election:LPElection (sellNav = positionNav, peer-blind)
//   • Accept delegation → EDP_Accept on its ExecDelegationProposal
//   • Accept interest   → OFI_Accept on its OldFundInterestOffer (gp offers → lp accepts)
//   • Propose participation → create DealParticipation (lp proposes → gp accepts)
// Reads its own election + post-close USDC RegistryHolding. Cash-out leg settles
// at the GP's atomic Close.
import { useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, counter, DEAL_ID, DEMO, shortParty } from '../lib/useLedger';
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

const POSITION_NAV = DEMO.interestNav; // $1.0M — matches the close-wallets flow

// `embedded` mounts only the cards for a given Deal Page tab (dropping the
// standalone StageHead + deal-summary chrome the page already renders).
export type LpSection = 'election' | 'preauth' | 'holding';

export default function ExitingLP({ embedded }: { embedded?: LpSection[] } = {}) {
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
  const [usdc, setUsdc] = useState<number>(0);

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
    setUsdc(
      h
        .filter((c) => c.args.owner === L.me && c.args.instId === DEMO.usdc)
        .reduce((s, c) => s + Number(c.args.amount), 0),
    );
  };
  useRefresh(refresh, [L.me]);

  const electSell = () =>
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
                rollNav: '0.0',
                sellNav: POSITION_NAV,
                disclosureHash: DEMO.contentHash,
              },
            },
          },
        ],
        R.election,
      );
      await refresh();
      return 'Sell election signed — no other LP, and not the GP, can see your amount, only that you filed.';
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

  const acceptOffer = () =>
    run('offer', async () => {
      if (!offer) throw new Error('No OldFundInterestOffer addressed to you yet — the GP offers it first.');
      await L.submit(
        [{ ExerciseCommand: { templateId: T.interestOffer, contractId: offer.contractId, choice: 'OFI_Accept', choiceArgument: {} } }],
        R.interest,
      );
      await refresh();
      return 'Old-fund interest accepted — this is the position the Close burns for your cash.';
    });

  const proposeParticipation = () =>
    run('part', async () => {
      await L.submit(
        [{ CreateCommand: { templateId: T.dealPart, createArguments: { gp: counter.gp, lp: L.me } } }],
        R.dealPart,
      );
      await refresh();
      return 'Participation proposed — the GP accepts it to admit you to the close.';
    });

  return (
    <div className="stack g4">
      {!bare && (
        <StageHead
          tag="INVESTOR — LEAVING"
          role="Exiting LP"
          title="Cash out at the set price"
          lede="You decide to sell at the room's clearing price — signed by your custodian, and blind to every other LP. Your cash leg settles inside the GP's one atomic Close."
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
      <Card title="Elect: sell">
        {election ? (
          <div className="stack g3">
            <span className="chip ok">Election filed — Sell {fmtM(election.args.sellNav)}</span>
            <span className="cant-see">Peer-blind: no other LP's projection contains this, and the GP sees only that you filed.</span>
          </div>
        ) : (
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy} onClick={electSell}>
              {busy === 'elect' ? 'Signing…' : 'Elect to sell'}
            </button>
          </div>
        )}
      </Card>
      )}

      {show('preauth') && (
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
              {interest ? 'Interest accepted ✓' : busy === 'offer' ? 'Signing…' : 'Accept interest offer'}
            </button>
            {!offer && !interest && <span className="hint">Waiting on the GP's old-fund interest offer.</span>}
          </div>
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy || !!participation} onClick={proposeParticipation}>
              {participation ? 'Participation proposed ✓' : busy === 'part' ? 'Signing…' : 'Propose participation'}
            </button>
          </div>
        </div>
      </Card>
      )}

      {show('holding') && (
        <Card title="Post-close cash">
          <dl className="kv">
            <dt>USDC</dt>
            <dd className="mono">{usdc ? fmtM(String(usdc)) : <span className="chip pending">none yet — settles at Close</span>}</dd>
          </dl>
        </Card>
      )}

      <ErrNote err={err} note={note} />
    </div>
  );
}
