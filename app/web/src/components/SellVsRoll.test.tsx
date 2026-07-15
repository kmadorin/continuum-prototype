// Sell-vs-Roll tests: the Rolling LP's comparison renders BOTH columns off the same
// independent-NAV basis, and BOTH are repriced at the clearing price — sell = stake ×
// clearing% in cash; roll = stake × clearing% in CV units @ $1.00.
//
// The roll figure is the one that matters: Clearing.daml mints
// `rollerUnits = roundDollar (clearing × rollNav)`, so quoting the undiscounted stake here
// would promise units the atomic Close does not issue.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import SellVsRoll from './SellVsRoll';

afterEach(cleanup);

describe('SellVsRoll', () => {
  it('prices both columns at the clearing price', () => {
    render(<SellVsRoll stakeNav={200_000_000} clearingPct={0.96} />);

    const sell = screen.getByTestId('svr-sell');
    expect(within(sell).getByText('$192.0M')).toBeTruthy();
    expect(within(sell).getByText('cash')).toBeTruthy();

    // 96% × $200M — NOT the $200M stake at par.
    const roll = screen.getByTestId('svr-roll');
    expect(within(roll).getByText('192,000,000')).toBeTruthy();
    expect(within(roll).getByText('CV units @ $1.00')).toBeTruthy();
  });

  it('does not quote the roll at par value', () => {
    render(<SellVsRoll stakeNav={200_000_000} clearingPct={0.96} />);
    expect(screen.queryByText('200,000,000')).toBeNull();
  });
});
