// Sell-vs-Roll comparison — the Rolling LP's product-thinking moment. Two columns
// off the SAME independent-NAV basis, priced at the SAME clearing price:
//
//   SELL now  → stake × clearing%  in cash today (crystallized, exits the vehicle)
//   ROLL      → stake × clearing%  in CV units @ $1.00 (stays invested, future upside)
//
// Both sides are repriced at the clearing price — that is the whole point of the
// number: a roll is not a par-value swap. It mirrors Clearing.daml, which mints
// `rollerUnits = roundDollar (clearing × rollNav)`; showing the undiscounted stake
// here would promise the roller units the close will not issue.
import { atClearing } from '../lib/useLedger';

const fmtUsdM = (n: number): string => `$${(n / 1_000_000).toFixed(1)}M`;

export default function SellVsRoll({
  /** The LP's position NAV (independent basis), e.g. 100_000_000. */
  stakeNav,
  /** Deal clearing price as a fraction (0.96). */
  clearingPct = 0.96,
}: {
  stakeNav: number;
  clearingPct?: number;
}) {
  const cash = atClearing(stakeNav, clearingPct);
  const units = atClearing(stakeNav, clearingPct); // CV units @ $1.00, repriced at the clearing price
  const pct = Math.round(clearingPct * 100);

  return (
    <div className="panel svr" data-testid="sell-vs-roll">
      <div className="panel-head">
        <h2>Your choice — sell vs roll</h2>
        <span className="ph-meta">same {pct}%-of-independent-NAV basis</span>
      </div>
      <div className="panel-body">
        <div className="svr-cols">
          <div className="svr-col" data-testid="svr-sell">
            <div className="svr-kicker">Sell now</div>
            <div className="svr-fig mono">{fmtUsdM(cash)}</div>
            <div className="svr-unit">cash</div>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              Crystallize at {pct}% of the independent NAV and exit the vehicle. Settles as USDC in your
              custody at Close.
            </p>
          </div>
          <div className="svr-div" aria-hidden="true" />
          <div className="svr-col" data-testid="svr-roll">
            <div className="svr-kicker">Roll</div>
            <div className="svr-fig mono">~{units.toLocaleString()}</div>
            <div className="svr-unit">CV units @ $1.00</div>
            <p className="hint" style={{ margin: '10px 0 0' }}>
              Roll your {fmtUsdM(stakeNav)} position into the new vehicle on the same {pct}%-of-independent-NAV
              basis — stay invested and retain the future upside.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
