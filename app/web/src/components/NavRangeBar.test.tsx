// NavRangeBar render test: the low/high axis ends, the headline NAV, and the
// distinct clearing marker all render with their $M figures.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import NavRangeBar from './NavRangeBar';

afterEach(cleanup);

describe('NavRangeBar', () => {
  it('renders low, high, headline NAV and the clearing marker', () => {
    render(<NavRangeBar navLow={480_000_000} navHigh={520_000_000} mid={500_000_000} clearing={480_000_000} clearingPct={0.96} />);

    expect(within(screen.getByTestId('nrb-low')).getByText('$480.0M')).toBeTruthy();
    expect(within(screen.getByTestId('nrb-high')).getByText('$520.0M')).toBeTruthy();
    expect(within(screen.getByTestId('nrb-nav')).getByText('$500.0M')).toBeTruthy();

    const clearing = screen.getByTestId('nrb-clearing');
    expect(within(clearing).getByText('$480.0M')).toBeTruthy();
    // The clearing tag carries the 96% context.
    expect(within(clearing).getByText(/96%/)).toBeTruthy();
  });

  it('exposes an accessible summary of the range', () => {
    render(<NavRangeBar navLow={480_000_000} navHigh={520_000_000} mid={500_000_000} clearing={480_000_000} clearingPct={0.96} />);
    const img = screen.getByRole('img');
    expect(img.getAttribute('aria-label')).toMatch(/480\.0M to \$520\.0M/);
    expect(img.getAttribute('aria-label')).toMatch(/clearing price \$480\.0M \(96% of NAV\)/);
  });
});
