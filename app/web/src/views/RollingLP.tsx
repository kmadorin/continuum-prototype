// Rolling LP (role `lpRolling`) — the investor staying in. Its custodian signs:
//   • Elect to roll     → create Continuum.Election:LPElection (rollNav = positionNav, peer-blind)
//   • Accept delegation → EDP_Accept on its ExecDelegationProposal
// Economically the mirror of the Exiting LP (roll instead of sell). The 5th seat
// was not in the 4-wallet headless close-wallets.ts; the action shapes are the
// same and it typechecks + submits — a live 5-party close is Task 9.
import { useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, DEAL_ID, DEMO, shortParty } from '../lib/useLedger';
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

const POSITION_NAV = '1000000.0';

export default function RollingLP() {
  const L = useLedger();
  const { busy, err, note, run } = useAction();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [election, setElection] = useState<ActiveContract | null>(null);
  const [prop, setProp] = useState<ActiveContract | null>(null);
  const [deleg, setDeleg] = useState<ActiveContract | null>(null);
  const [units, setUnits] = useState<number>(0);

  const refresh = async (alive: () => boolean = () => true) => {
    const [d, el, p, dg, h] = await Promise.all([
      L.myAcs(R.deal),
      L.myAcs(R.election),
      L.myAcs(R.execDelegProp),
      L.myAcs(R.execDeleg),
      L.myAcs(R.holding),
    ]);
    if (!alive()) return;
    setDeal(pick(d));
    setElection(pick(el, (c) => c.args.lp === L.me));
    setProp(pick(p, (c) => c.args.party === L.me));
    setDeleg(pick(dg, (c) => c.args.party === L.me));
    setUnits(
      h
        .filter((c) => c.args.owner === L.me && c.args.instId === DEMO.unit)
        .reduce((s, c) => s + Number(c.args.amount), 0),
    );
  };
  useRefresh(refresh, [L.me]);

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

  return (
    <div className="stack g4">
      <StageHead
        tag="INVESTOR — STAYING"
        role="Rolling LP"
        title="Roll into the new vehicle"
        lede="You decide to stay in at the room's clearing price — signed by your custodian, blind to every other LP. Your rolled units settle inside the GP's one atomic Close."
      />

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

      <Card title="Elect: roll over">
        {election ? (
          <div className="stack g3">
            <span className="chip ok">Election filed — Roll {fmtM(election.args.rollNav)}</span>
            <span className="cant-see">Peer-blind: no other LP's projection contains this election.</span>
          </div>
        ) : (
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy} onClick={electRoll}>
              {busy === 'elect' ? 'Signing…' : 'Elect to roll over'}
            </button>
          </div>
        )}
      </Card>

      <Card title="Pre-authorize the close">
        <div className="actions">
          <button className="btn" type="button" disabled={!!busy || !!deleg || !prop} onClick={acceptDelegation}>
            {deleg ? 'Delegation accepted ✓' : busy === 'deleg' ? 'Signing…' : 'Accept execution delegation'}
          </button>
          {!prop && !deleg && <span className="hint">Waiting on the GP's delegation proposal.</span>}
        </div>
      </Card>

      <Card title="Post-close holding">
        <dl className="kv">
          <dt>Rolled CV units ({DEMO.unit})</dt>
          <dd className="mono">{units ? units.toLocaleString() : <span className="chip pending">none yet — settles at Close</span>}</dd>
        </dl>
      </Card>

      <ErrNote err={err} note={note} />
    </div>
  );
}
