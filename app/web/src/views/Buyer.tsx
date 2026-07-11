// Secondary Buyer (role `buyer`). Its custodian signs its transactions on its
//   • Submit sealed bid       → create Continuum.Auction:SealedBid   (buyer-signed, peer+GP-blind)
//   • Accept exec delegation  → EDP_Accept on its ExecDelegationProposal (once gp proposes it)
// Reads its own SealedBid + post-close CV-unit RegistryHolding from its own
// per-party ACS projection. Every write POSTs to /action — the custody backend signs.
import { useState } from 'react';
import type { ActiveContract } from '../../../ledger-client/src/types';
import { useLedger, T, R, counter, DEAL_ID, DEMO, shortParty } from '../lib/useLedger';
import HoldingReceipt from '../components/HoldingReceipt';
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

// `embedded` mounts only the cards for a given Deal Page tab (and drops the
// standalone StageHead + deal-summary chrome the page already renders).
export type BuyerSection = 'bid' | 'delegation' | 'holding';

export default function Buyer({ embedded }: { embedded?: BuyerSection[] } = {}) {
  const bare = !!embedded;
  const show = (s: BuyerSection) => !embedded || embedded.includes(s);
  const L = useLedger();
  const { busy, err, note, run } = useAction();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [bid, setBid] = useState<ActiveContract | null>(null);
  const [prop, setProp] = useState<ActiveContract | null>(null);
  const [deleg, setDeleg] = useState<ActiveContract | null>(null);
  const [units, setUnits] = useState<number>(0);
  const [holding, setHolding] = useState<ActiveContract | null>(null);
  const [pct, setPct] = useState<string>(DEMO.clearingPct);
  const [capacity, setCapacity] = useState('6000000.0');

  const refresh = async (alive: () => boolean = () => true) => {
    const [d, b, p, dg, h] = await Promise.all([
      L.myAcs(R.deal),
      L.myAcs(R.sealedBid),
      L.myAcs(R.execDelegProp),
      L.myAcs(R.execDeleg),
      L.myAcs(R.holding),
    ]);
    if (!alive()) return;
    setDeal(pick(d));
    setBid(pick(b, (c) => c.args.buyer === L.me));
    setProp(pick(p, (c) => c.args.party === L.me));
    setDeleg(pick(dg, (c) => c.args.party === L.me));
    const mine = h.filter((c) => c.args.owner === L.me && c.args.instId === DEMO.unit);
    setUnits(mine.reduce((s, c) => s + Number(c.args.amount), 0));
    setHolding(pick(mine));
  };
  useRefresh(refresh, [L.me]);

  const submitBid = () =>
    run('bid', async () => {
      await L.submit(
        [
          {
            CreateCommand: {
              templateId: T.sealedBid,
              createArguments: {
                gp: counter.gp,
                buyer: L.me,
                dealId: DEAL_ID,
                pctOfNav: pct,
                capacity,
              },
            },
          },
        ],
        R.sealedBid,
      );
      await refresh();
      return 'Sealed bid signed and submitted — blind to every other buyer and to the GP until select.';
    });

  const acceptDelegation = () =>
    run('accept', async () => {
      if (!prop) throw new Error('No ExecDelegationProposal addressed to you yet — the GP proposes it first.');
      await L.submit(
        [
          {
            ExerciseCommand: {
              templateId: T.execDelegProp,
              contractId: prop.contractId,
              choice: 'EDP_Accept',
              choiceArgument: {},
            },
          },
        ],
        R.execDeleg,
      );
      await refresh();
      return 'Execution delegation accepted — the GP may now settle your unit leg atomically at Close.';
    });

  return (
    <div className="stack g4">
      {!bare && (
        <StageHead
          tag="SECONDARY BUYER"
          role="Buy-side"
          title="Bid sealed, buy the units"
          lede="Your bid is signed by your custodian and stays blind to every other buyer. You separately pre-authorize the GP to settle your leg — no key ever touches this browser."
        />
      )}

      {!bare && (
        <Card title={deal ? (deal.args.cv as string) : 'Deal — not yet visible to you'}>
          <dl className="kv">
            <dt>Signed in as</dt>
            <dd className="mono">{shortParty(L.me)}</dd>
            <dt>Clearing price</dt>
            <dd>
              {deal?.args.clearingPrice ? (
                `${fmtPct(deal.args.clearingPrice)} of NAV`
              ) : (
                <span className="chip sealed">sealed — set by the room</span>
              )}
            </dd>
          </dl>
        </Card>
      )}

      {show('bid') && (
      <Card title="Sealed bid">
        {bid ? (
          <div className="stack g3">
            <span className="chip ok">Your bid is in</span>
            <dl className="kv">
              <dt>Bid</dt>
              <dd>{fmtPct(bid.args.pctOfNav)} of NAV</dd>
              <dt>Capacity</dt>
              <dd>{fmtM(bid.args.capacity)}</dd>
            </dl>
            <span className="cant-see">No other buyer — and not the GP — can see this until the lead is selected.</span>
          </div>
        ) : (
          <div className="stack g3">
            <div className="form-row">
              <label htmlFor="bp">Bid — % of NAV</label>
              <div className="input-group">
                <input className="input" id="bp" type="number" step="0.01" min="0" max="1" value={pct} onChange={(e) => setPct(e.target.value)} />
                <span className="suffix">of NAV</span>
              </div>
            </div>
            <div className="form-row">
              <label htmlFor="bc">Capacity — NAV you'll absorb</label>
              <div className="input-group">
                <span className="prefix">$</span>
                <input className="input" id="bc" type="number" step="0.5" min="0" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </div>
            </div>
            <div className="actions">
              <button className="btn" type="button" disabled={!!busy} onClick={submitBid}>
                {busy === 'bid' ? 'Signing…' : 'Submit sealed bid'}
              </button>
              <span className="cant-see">Signed by your custodian — blind to other buyers.</span>
            </div>
          </div>
        )}
      </Card>
      )}

      {show('delegation') && (
      <Card title="Execution delegation">
        <p className="hint" style={{ marginTop: 0 }}>
          Pre-authorize the GP to move your unit leg at Close — a propose/accept, not a key handover.
        </p>
        {deleg ? (
          <span className="chip ok">Delegation accepted</span>
        ) : (
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy || !prop} onClick={acceptDelegation}>
              {busy === 'accept' ? 'Signing…' : 'Accept execution delegation'}
            </button>
            {!prop && <span className="hint">Waiting on the GP to propose the delegation.</span>}
          </div>
        )}
      </Card>
      )}

      {show('holding') &&
        (units > 0 && holding ? (
          <HoldingReceipt
            amount={units}
            clearingPct={Number(deal?.args.clearingPrice ?? DEMO.clearingPct)}
            metaHash={(holding.args.meta_ as Record<string, string> | undefined)?.['continuum/valuation-sha256'] ?? ''}
          />
        ) : (
          <Card title="My holding">
            <dl className="kv">
              <dt>CV units ({DEMO.unit})</dt>
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
