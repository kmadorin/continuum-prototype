// Sell-vs-Roll tests: the Rolling LP's comparison renders BOTH columns off the same
// independent-NAV basis — sell = stake × clearing% in cash; roll = stake worth of
// CV units @ $1.00.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import SellVsRoll from './SellVsRoll';

afterEach(cleanup);

describe('SellVsRoll', () => {
  it('renders both the SELL and ROLL columns with derived figures', () => {
    render(<SellVsRoll stakeNav={100_000_000} clearingPct={0.96} />);

    const sell = screen.getByTestId('svr-sell');
    expect(within(sell).getByText('$96.0M')).toBeTruthy();
    expect(within(sell).getByText('cash')).toBeTruthy();

    const roll = screen.getByTestId('svr-roll');
    expect(within(roll).getByText('~100,000,000')).toBeTruthy();
    expect(within(roll).getByText('CV units @ $1.00')).toBeTruthy();
  });
});
