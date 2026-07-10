import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { PrivacyProof } from './PrivacyProof';
import { MockLedgerClient } from '../ledger/mock';

describe('PrivacyProof', () => {
  it('shows a bid to its owner and hides it from peers', async () => {
    const m = new MockLedgerClient();
    await m.submit({
      commandId: '1',
      actAs: ['buyerA'],
      commands: [
        {
          CreateCommand: {
            templateId: '#continuum-contracts:Continuum.Auction:SealedBid',
            createArguments: { buyer: 'buyerA' },
          },
        },
      ],
    });
    render(<PrivacyProof client={m} parties={{ buyerA: 'buyerA', buyerB: 'buyerB', gp: 'gp' }} />);
    await waitFor(() => {
      expect(screen.getByTestId('acs-buyerA').textContent).toContain('SealedBid');
      expect(screen.getByTestId('acs-buyerB').textContent).not.toContain('SealedBid');
    });
  });
});
