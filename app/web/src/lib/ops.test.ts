import { describe, it, expect } from 'vitest';
import { createDeal, sealedBid, election, setClearing } from './ops';

describe('ops builders', () => {
  it('createDeal emits a CreateCommand with the room observers', () => {
    const c = createDeal({ gp: 'GP', vehicle: 'GP', room: ['B', 'L'], fund: 'F', cv: 'CV', asset: 'A', refNav: '52000000.0', deadline: '2026-07-20T00:00:00Z' });
    expect(c.CreateCommand.templateId).toContain(':Continuum.Deal:ContinuationDeal');
    expect((c.CreateCommand.createArguments as any).room).toEqual(['B', 'L']);
  });
  it('sealedBid has the buyer as the only structural signer', () => {
    const c = sealedBid({ gp: 'GP', buyer: 'B', deal: 'd1', pctOfNav: '0.96', capacity: '20000000.0' });
    expect(c.CreateCommand.templateId).toContain(':Continuum.Auction:SealedBid');
  });
  it('setClearing is an ExerciseCommand carrying the price', () => {
    const c = setClearing('deal-cid', '0.96');
    expect(c.ExerciseCommand.choice).toBe('SetClearing');
    expect((c.ExerciseCommand.choiceArgument as any).p).toBe('0.96');
  });
  it('election emits a CreateCommand for the LP position split', () => {
    const c = election({ lp: 'L', deal: 'd1', positionNav: '1000.0', rollNav: '600.0', sellNav: '400.0', disclosureHash: 'abcd' });
    expect(c.CreateCommand.templateId).toContain(':Continuum.Election:LPElection');
    expect((c.CreateCommand.createArguments as any).rollNav).toBe('600.0');
  });
});
