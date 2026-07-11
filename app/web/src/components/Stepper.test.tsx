// Stepper render tests: states resolve to the right chrome and the active stage is
// announced to assistive tech via aria-current.
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import Stepper, { type Stage } from './Stepper';

afterEach(cleanup);

const STAGES: Stage[] = [
  { label: 'Valuation', state: 'done' },
  { label: 'LPAC Consent', state: 'done' },
  { label: 'Auction', state: 'active' },
  { label: 'Elections', state: 'future' },
  { label: 'Issuance', state: 'future' },
  { label: 'Close', state: 'future' },
];

describe('Stepper', () => {
  it('renders every stage label', () => {
    render(<Stepper stages={STAGES} />);
    for (const s of STAGES) expect(screen.getByText(s.label)).toBeTruthy();
  });

  it('marks the active stage with aria-current="step"', () => {
    render(<Stepper stages={STAGES} />);
    const active = screen.getByText('Auction').closest('li');
    expect(active?.getAttribute('aria-current')).toBe('step');
    // Done + future stages are not the current step.
    expect(screen.getByText('Valuation').closest('li')?.getAttribute('aria-current')).toBeNull();
    expect(screen.getByText('Elections').closest('li')?.getAttribute('aria-current')).toBeNull();
  });

  it('renders a check glyph for done stages and a number for active/future', () => {
    render(<Stepper stages={STAGES} />);
    // Two done stages → two check SVGs.
    expect(screen.getAllByTestId('lc-step-done')).toHaveLength(2);
    // Active stage shows its 1-based index (3rd = "3").
    expect(screen.getByText('Auction').closest('li')?.textContent).toContain('3');
  });
});
