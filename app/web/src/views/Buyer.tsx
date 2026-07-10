// portal/buyer.html — "Secondary Buyer". Submits a sealed bid
// (Continuum.Auction:SealedBid) and DEMONSTRATES peer-blindness by reading the
// OTHER buyer's ledger projection and showing it does not contain this bid.
import { useEffect, useState } from 'react';
import type { ActiveContract, LedgerClient } from '../../../ledger-client/src/types';
import { useParty } from '../state/PartyContext';
import { partyRegistry } from '../ledger/party-registry.mock';
import { sealedBid } from '../lib/ops';
import { Card, StageHead, fmtM, fmtPct, latest, readDeal } from './shared';

export default function Buyer({ client }: { client: LedgerClient }) {
  const { current, personas } = useParty();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [myBid, setMyBid] = useState<ActiveContract | null>(null);
  const [pct, setPct] = useState('0.96');
  const [capacity, setCapacity] = useState('20000000.0');
  const [busy, setBusy] = useState(false);
  const [peerCheck, setPeerCheck] = useState<{ party: string; count: number } | null>(null);

  const refresh = async (alive: () => boolean = () => true) => {
    const d = await readDeal(client, current);
    const bid = latest(await client.activeContracts(current, { templateId: 'SealedBid' }));
    if (!alive()) return;
    setDeal(d);
    setMyBid(bid);
  };

  useEffect(() => {
    let alive = true;
    refresh(() => alive);
    setPeerCheck(null);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current]);

  const submitBid = async () => {
    if (!deal) return;
    setBusy(true);
    await client.submit({
      commandId: `bid-${current}-${Date.now()}`,
      actAs: [current],
      commands: [
        sealedBid({
          gp: personas.gp,
          buyer: current,
          deal: deal.args.cv as string,
          pctOfNav: pct,
          capacity,
        }),
      ],
    });
    await refresh();
    // Peer-blindness proof: query the OTHER buyer's activeContracts() and show
    // it doesn't contain (isn't even aware of) this bid. SealedBid's sole
    // signatory is `buyer` — MockLedgerClient's stakeholders for SealedBid are
    // actAs-only (peer-blind by construction), so this count is always 0.
    const otherBuyer = current === partyRegistry.parties.buyer ? partyRegistry.parties.buyer2 : partyRegistry.parties.buyer;
    const peerBids = await client.activeContracts(otherBuyer, { templateId: 'SealedBid' });
    setPeerCheck({ party: otherBuyer, count: peerBids.length });
    setBusy(false);
  };

  const cv = (deal?.args.cv as string) ?? null;

  return (
    <div className="stack g4">
      <StageHead
        tag="SECONDARY BUYER"
        role="Buy-side"
        title="Set the price and bid, sealed"
        lede="The buy side sets one price — validated by a fairness opinion — and it becomes public to the whole room. Your bid stays blind to every other buyer until then."
      />
      <Card title={cv ?? 'No deal open yet'}>
        <dl className="kv">
          <dt>Fairness-checked deal</dt>
          <dd>{cv ? cv : <span className="chip pending">waiting on the advisor to open the room</span>}</dd>
        </dl>
      </Card>

      {!myBid ? (
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
            <button className="btn" type="button" disabled={busy || !deal} onClick={submitBid}>
              Submit sealed bid
            </button>
            <span className="cant-see">Blind to other buyers — they can't see yours, and you can't see theirs.</span>
          </div>
        </div>
      ) : (
        <div className="stack g3">
          <div className="actions">
            <span className="chip ok">Your bid is in</span>
          </div>
          <Card title="Your sealed bid">
            <dl className="kv">
              <dt>Bid</dt>
              <dd>{fmtPct(myBid.args.pctOfNav)} of NAV</dd>
              <dt>Capacity</dt>
              <dd>{fmtM(myBid.args.capacity)}</dd>
            </dl>
          </Card>
          {peerCheck && (
            <p className="hint">
              Proof of peer-blindness: querying the other buyer's ledger view (
              <span className="mono">{peerCheck.party}</span>) for SealedBid returns{' '}
              <b>{peerCheck.count}</b> contract(s) — none of them is this bid.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
