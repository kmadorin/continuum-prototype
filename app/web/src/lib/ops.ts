// UI-action -> JsCommand builders (Stream B seam).
// Field names are reconciled against the real Daml templates in
// continuum-daml/contracts/daml/Continuum/{Deal,Auction,Election}.daml.
const PKG = '#continuum-contracts';

type CreateCmd = { CreateCommand: { templateId: string; createArguments: Record<string, unknown> } };
type ExerciseCmd = { ExerciseCommand: { templateId: string; contractId: string; choice: string; choiceArgument: Record<string, unknown> } };

// Continuum.Deal:ContinuationDeal — with gp, vehicle, oldFund, lpac, regulator,
// room, fund, cv, asset, refNav, electionDeadline, clearingPrice, gpCommitment,
// carryCrystallized, stage (Deal.daml:16-31).
export const createDeal = (a: {
  gp: string;
  vehicle: string;
  room: string[];
  fund: string;
  cv: string;
  asset: string;
  refNav: string;
  deadline: string;
}): CreateCmd => ({
  CreateCommand: {
    templateId: `${PKG}:Continuum.Deal:ContinuationDeal`,
    createArguments: {
      gp: a.gp,
      vehicle: a.vehicle,
      oldFund: a.gp,
      lpac: a.gp,
      regulator: a.gp,
      room: a.room,
      fund: a.fund,
      cv: a.cv,
      asset: a.asset,
      refNav: a.refNav,
      electionDeadline: a.deadline,
      clearingPrice: null,
      gpCommitment: '0.0',
      carryCrystallized: '0.0',
      stage: 'Bidding',
    },
  },
});

// Continuum.Auction:SealedBid — with gp, buyer, dealId, pctOfNav, capacity
// (Auction.daml:6-12). NOTE: the plan's sample used `price`/omitted `gp`; the
// real template has neither a `price` field (it's `pctOfNav`, a 0–1 NAV
// fraction) nor is `gp` optional. `gp` is REQUIRED here: the Daml
// `ensure buyer /= gp` self-dealing guard needs a real, distinct GP party, so
// a default would silently defeat it and produce an invalid Party.
export const sealedBid = (a: {
  gp: string;
  buyer: string;
  deal: string;
  pctOfNav: string;
  capacity: string;
}): CreateCmd => ({
  CreateCommand: {
    templateId: `${PKG}:Continuum.Auction:SealedBid`,
    createArguments: {
      gp: a.gp,
      buyer: a.buyer,
      dealId: a.deal,
      pctOfNav: a.pctOfNav,
      capacity: a.capacity,
    },
  },
});

// Continuum.Election:LPElection — with lp, dealId, positionNav, rollNav,
// sellNav, disclosureHash (Election.daml:6-12). NOTE: the plan's sample
// assumed a `choice: 'Roll'|'Sell'` enum and a `consentedHash` field; the
// real template has neither — it instead splits the position into
// rollNav/sellNav Decimals (with `rollNav + sellNav == positionNav`) and
// names the hash field `disclosureHash`. Rebuilt the builder signature to
// match.
export const election = (a: {
  lp: string;
  deal: string;
  positionNav: string;
  rollNav: string;
  sellNav: string;
  disclosureHash: string;
}): CreateCmd => ({
  CreateCommand: {
    templateId: `${PKG}:Continuum.Election:LPElection`,
    createArguments: {
      lp: a.lp,
      dealId: a.deal,
      positionNav: a.positionNav,
      rollNav: a.rollNav,
      sellNav: a.sellNav,
      disclosureHash: a.disclosureHash,
    },
  },
});

// Continuum.Deal:ContinuationDeal.RecordConsent — no choice args (Deal.daml:43-46).
// Moves the deal to the Consented stage; OpenElections is gated on stage==Consented,
// so this must be exercised before elections can open. Consuming → returns a new cid.
export const recordConsent = (dealCid: string): ExerciseCmd => ({
  ExerciseCommand: {
    templateId: `${PKG}:Continuum.Deal:ContinuationDeal`,
    contractId: dealCid,
    choice: 'RecordConsent',
    choiceArgument: {},
  },
});

// Continuum.Deal:ContinuationDeal.SetClearing — with p : Decimal (Deal.daml:49-53).
export const setClearing = (dealCid: string, p: string): ExerciseCmd => ({
  ExerciseCommand: {
    templateId: `${PKG}:Continuum.Deal:ContinuationDeal`,
    contractId: dealCid,
    choice: 'SetClearing',
    choiceArgument: { p },
  },
});

// Continuum.Deal:ContinuationDeal.OpenElections — no choice args (Deal.daml:57-61).
export const openElections = (dealCid: string): ExerciseCmd => ({
  ExerciseCommand: {
    templateId: `${PKG}:Continuum.Deal:ContinuationDeal`,
    contractId: dealCid,
    choice: 'OpenElections',
    choiceArgument: {},
  },
});
