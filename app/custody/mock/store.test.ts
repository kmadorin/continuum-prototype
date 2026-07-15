import { describe, it, expect } from 'vitest';
import { MockLedgerStore } from './store';

const GP = 'gp::1220aaaa';
const BUYER = 'buyer::1220bbbb';

const createDeal = {
  CreateCommand: {
    templateId: '#continuum:Continuum.Deal:ContinuationDeal',
    createArguments: { dealId: 'M1', owner: GP, room: [BUYER], stage: 'Open' },
  },
};

describe('MockLedgerStore', () => {
  it('materializes a create and projects it to actAs', () => {
    const s = new MockLedgerStore();
    const { updateId } = s.submit([GP], [createDeal]);
    expect(updateId).toMatch(/^1220/);
    const acs = s.activeContracts(GP);
    expect(acs).toHaveLength(1);
    expect(acs[0].args.dealId).toBe('M1');
  });

  it('projects a ContinuationDeal to room observers', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    expect(s.activeContracts(BUYER)).toHaveLength(1);
  });

  it('keeps SealedBid peer-blind', () => {
    const s = new MockLedgerStore();
    s.submit([BUYER], [{
      CreateCommand: {
        templateId: '#continuum:Continuum.Auction:SealedBid',
        createArguments: { bidder: BUYER, owner: GP, price: '0.96' },
      },
    }]);
    expect(s.activeContracts(BUYER)).toHaveLength(1);
    expect(s.activeContracts(GP)).toHaveLength(0);
  });

  it('filters by templateId suffix', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    expect(s.activeContracts(GP, { templateId: 'Continuum.Deal:ContinuationDeal' })).toHaveLength(1);
    expect(s.activeContracts(GP, { templateId: 'Nope:Nope' })).toHaveLength(0);
  });

  it('applies SetClearing and OpenElections', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    const cid = s.activeContracts(GP)[0].contractId;
    s.submit([GP], [{ ExerciseCommand: { templateId: '#continuum:Continuum.Deal:ContinuationDeal', contractId: cid, choice: 'SetClearing', choiceArgument: { p: '0.96' } } }]);
    expect(s.activeContracts(GP)[0].args.clearingPrice).toBe('0.96');
    s.submit([GP], [{ ExerciseCommand: { templateId: '#continuum:Continuum.Deal:ContinuationDeal', contractId: cid, choice: 'OpenElections', choiceArgument: {} } }]);
    expect(s.activeContracts(GP)[0].args.stage).toBe('Electing');
  });

  it('ignores unknown choices without throwing', () => {
    const s = new MockLedgerStore();
    s.submit([GP], [createDeal]);
    const cid = s.activeContracts(GP)[0].contractId;
    expect(() => s.submit([GP], [{ ExerciseCommand: { templateId: 'x', contractId: cid, choice: 'Close', choiceArgument: {} } }])).not.toThrow();
  });

  it('records an update tree per submit, keyed by updateId', () => {
    const s = new MockLedgerStore();
    const { updateId } = s.submit([GP], [createDeal]);
    const tree = s.updateTree(updateId);
    expect(tree).toBeDefined();
    expect((tree as any).updateId).toBe(updateId);
    expect((tree as any).events).toHaveLength(1);
  });

  it('ledgerEnd offset grows with the store', () => {
    const s = new MockLedgerStore();
    expect(s.ledgerEnd().offset).toBe(0);
    s.submit([GP], [createDeal]);
    expect(s.ledgerEnd().offset).toBe(1);
  });

  it('seed() replaces contents and reset() restores the seed', () => {
    const s = new MockLedgerStore();
    s.seed([{ contractId: 'c1', templateId: '#continuum:Continuum.Deal:ContinuationDeal', args: { dealId: 'M1', owner: GP, room: [BUYER] } }]);
    expect(s.activeContracts(GP)).toHaveLength(1);
    s.submit([GP], [createDeal]);
    expect(s.activeContracts(GP)).toHaveLength(2);
    s.reset();
    expect(s.activeContracts(GP)).toHaveLength(1);
  });

  it('seed() honours EXPLICIT stakeholders over inference', () => {
    const s = new MockLedgerStore();
    s.seed([{
      contractId: 'vr1',
      templateId: '#continuum:Continuum.Valuation:ValuationReport',
      args: { agent: 'valuer::1220', gp: GP, dealId: 'M1' },
      stakeholders: ['valuer::1220', GP],
    }]);
    expect(s.activeContracts(GP)).toHaveLength(1);
    expect(s.activeContracts('valuer::1220')).toHaveLength(1);
    expect(s.activeContracts(BUYER)).toHaveLength(0);
  });
});
