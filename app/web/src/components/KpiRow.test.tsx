// KpiRow render tests: values + pending states render, and the shield is only
// interactive when a tile carries an updateId and an onInspect handler.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import KpiRow, { type Kpi } from './KpiRow';

afterEach(cleanup);

const TILES: Kpi[] = [
  { label: 'NAV (independent)', value: '$500.0M', sub: 'Independent valuation agent', asOf: '2026-06-30' },
  { label: 'Clearing price', value: '96% of NAV', sub: '$480.0M', asOf: '2026-06-30', updateId: 'update-xyz' },
  { label: 'CV units issued', value: '— Pending Issuance', pending: true },
];

describe('KpiRow', () => {
  it('renders each tile value and the pending placeholder', () => {
    render(<KpiRow tiles={TILES} />);
    expect(screen.getByText('$500.0M')).toBeTruthy();
    expect(screen.getByText('96% of NAV')).toBeTruthy();
    expect(screen.getByText('— Pending Issuance')).toBeTruthy();
    expect(screen.getAllByTestId('kpi-tile')).toHaveLength(3);
  });

  it('marks pending tiles with the pending class', () => {
    render(<KpiRow tiles={TILES} />);
    const pending = screen.getByText('— Pending Issuance').closest('.kpi-tile');
    expect(pending?.className).toContain('pending');
  });

  it('opens the inspector only for tiles with an updateId', () => {
    const onInspect = vi.fn();
    render(<KpiRow tiles={TILES} onInspect={onInspect} />);
    const shields = screen.getAllByRole('button');
    // NAV tile has no updateId → disabled shield.
    const navShield = screen.getByLabelText(/NAV \(independent\) — no on-ledger anchor yet/i);
    expect((navShield as HTMLButtonElement).disabled).toBe(true);
    // Clearing tile has an updateId → clickable.
    const clearShield = screen.getByLabelText(/Verify Clearing price on-ledger/i);
    fireEvent.click(clearShield);
    expect(onInspect).toHaveBeenCalledWith('update-xyz');
    expect(shields.length).toBe(3);
  });
});
