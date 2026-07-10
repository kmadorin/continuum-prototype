// Render test for the Ledger Inspector drawer (custody build). Mounts the drawer on
// an updateId and stubs the backend's /ledger/update/:id with a representative
// LEDGER_EFFECTS transaction tree — the drawer should surface the acting/signatory
// parties and the raw ledger JSON. Also unit-tests the tolerant tree parser.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { installBackend } from '../test/mockBackend';
import LedgerInspector, { parseUpdateTree } from './LedgerInspector';

const UPDATE_ID = 'update-xyz-987';

const tree = {
  update: {
    Transaction: {
      value: {
        updateId: UPDATE_ID,
        offset: 4242,
        recordTime: '2026-07-11T00:00:00Z',
        synchronizerId: 'sync-domain::abcdef123456',
        events: [
          {
            CreatedEvent: {
              value: {
                templateId: 'pkgid:Continuum.Deal:ContinuationDeal',
                contractId: 'deal-contract-1',
                signatories: ['continuum-gp-demo::ns'],
                observers: ['continuum-lpac-demo::ns'],
              },
            },
          },
          {
            ExercisedEvent: {
              value: {
                templateId: 'pkgid:Continuum.Deal:ContinuationDeal',
                contractId: 'deal-contract-1',
                choice: 'Close',
                actingParties: ['continuum-gp-demo::ns'],
              },
            },
          },
        ],
      },
    },
  },
};

beforeEach(() => {
  installBackend({
    me: { role: 'gp', party: 'continuum-gp-demo::ns', custodianName: 'Fireblocks — GP treasury' },
    registry: { parties: {}, custodians: {} },
    update: { [UPDATE_ID]: tree },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('parseUpdateTree', () => {
  it('extracts parties, events and metadata from a LEDGER_EFFECTS tree', () => {
    const p = parseUpdateTree(tree);
    expect(p.updateId).toBe(UPDATE_ID);
    expect(p.offset).toBe(4242);
    expect(p.parties.sort()).toEqual(['continuum-gp-demo::ns', 'continuum-lpac-demo::ns']);
    expect(p.events).toHaveLength(2);
    expect(p.events[0].kind).toBe('created');
    expect(p.events[0].templateId).toBe('Continuum.Deal:ContinuationDeal');
    expect(p.events[1].kind).toBe('exercised');
    expect(p.events[1].choice).toBe('Close');
  });
});

describe('LedgerInspector drawer', () => {
  it('renders the parties and the raw ledger JSON for a committed update', async () => {
    render(<LedgerInspector updateId={UPDATE_ID} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('insp-updateid').textContent).toBe(UPDATE_ID));

    // Acting/signatory party chips (short prefixes).
    expect(screen.getByTitle('continuum-gp-demo::ns')).toBeTruthy();
    expect(screen.getByTitle('continuum-lpac-demo::ns')).toBeTruthy();

    // Raw ledger JSON is the "not a mock" artifact (revealed on Show).
    fireEvent.click(screen.getByText(/^Show$/));
    expect(screen.getByTestId('insp-raw').textContent).toContain(UPDATE_ID);
  });
});
