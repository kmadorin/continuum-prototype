// Gate-ceremony tests: the four LIVE check-lines render, the issue button is disabled
// when any proof is missing OR the issuance basis is absent, and enabled only when all
// four pass AND a basis exists. The issued state surfaces the count + Inspect button.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import IssueUnitsGate, { type GateCheck } from './IssueUnitsGate';

const CHECKS = (over: Partial<Record<string, boolean>> = {}): GateCheck[] => [
  { key: 'valuation', label: 'Independent valuation anchored', ok: over.valuation ?? true, fact: 'sha256 ab5a539d8b…07de09 · Kroll' },
  { key: 'fairness', label: 'Fairness opinion anchored', ok: over.fairness ?? true, fact: 'sha256 c0ffee…' },
  { key: 'consent', label: 'LPAC consent recorded', ok: over.consent ?? true, fact: 'LPAC recorded consent' },
  { key: 'auction', label: 'Auction certificate', ok: over.auction ?? true, fact: 'clearing 96% of NAV' },
];

const base = {
  unitsToIssue: 4_800_000,
  hasBasis: true,
  busy: false,
  issued: false,
  onIssue: () => {},
};

afterEach(cleanup);

describe('IssueUnitsGate', () => {
  it('renders the four gate check-lines', () => {
    render(<IssueUnitsGate {...base} checks={CHECKS()} />);
    expect(screen.getAllByTestId('gate-check')).toHaveLength(4);
    expect(screen.getByText('Independent valuation anchored')).toBeTruthy();
    expect(screen.getByText('Auction certificate')).toBeTruthy();
  });

  it('enables the issue button when all four pass AND a basis exists', () => {
    render(<IssueUnitsGate {...base} checks={CHECKS()} hasBasis />);
    const btn = screen.getByRole('button', { name: /Issue units against this basis/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('disables the button when one check is missing', () => {
    render(<IssueUnitsGate {...base} checks={CHECKS({ consent: false })} hasBasis />);
    const btn = screen.getByRole('button', { name: /Issue units against this basis/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/3 of 4 proofs anchored/)).toBeTruthy();
  });

  it('disables the button when all checks pass but the basis is missing', () => {
    render(<IssueUnitsGate {...base} checks={CHECKS()} hasBasis={false} />);
    const btn = screen.getByRole('button', { name: /Issue units against this basis/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByText(/assemble the issuance basis/i)).toBeTruthy();
  });

  it('fires onIssue when enabled and clicked', () => {
    const onIssue = vi.fn();
    render(<IssueUnitsGate {...base} checks={CHECKS()} hasBasis onIssue={onIssue} />);
    fireEvent.click(screen.getByRole('button', { name: /Issue units against this basis/i }));
    expect(onIssue).toHaveBeenCalledOnce();
  });

  it('shows the settled state with an Inspect button once issued', () => {
    const onInspect = vi.fn();
    render(
      <IssueUnitsGate
        {...base}
        checks={CHECKS()}
        issued
        issuedUnits={4_800_000}
        updateId="update-abc123def456"
        onInspect={onInspect}
      />,
    );
    expect(screen.getByTestId('gate-success')).toBeTruthy();
    expect(screen.getByText('CV units issued')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Inspect transaction/i }));
    expect(onInspect).toHaveBeenCalledWith('update-abc123def456');
  });
});
