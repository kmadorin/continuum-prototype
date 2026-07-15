// The fake ledger — an in-memory, append-only contract store with Canton's privacy
// projection, the Daml semantics the close ceremony depends on, and JSON Ledger API v2
// response shapes. It exists so the UI can be driven end-to-end with no devnet, no keys
// and no shared state.
//
// WHAT IT REPRODUCES (faithfully, from continuum-daml/contracts/daml/Continuum/):
//   - the projection: signatories + observers per template, so a SealedBid stays blind to
//     the GP and its peers, an LPElection stays blind to everyone but its LP, and the
//     FairnessDisclosure reaches only the LPAC/regulator. This is the product; a mock that
//     shows everyone everything would misrepresent it in every screenshot.
//   - the choices the UI issues, including the atomic Close: the antecedent-DAG gate
//     (ValidateIssuance), unit conservation against the PSA price, the pre-signed transfer
//     legs, the burns, and the two disclosures. A nested failure aborts the whole submit.
//   - controllers: exercising a choice you don't control fails, as on-ledger.
//
// WHAT IT IS NOT: the contracts. Real authorization comes from real signatures against a
// real synchronizer. A green run here says the UI wiring is right — never that the
// contracts are. That is what the Daml tests and the devnet close are for.
import type { ActiveContract, JsCommand } from '../../ledger-client/src/types';

type Contract = {
  contractId: string;
  templateId: string;
  args: Record<string, any>;
  signatories: string[];
  observers: string[];
  /** Set when archived: the contract leaves the ACS but stays in the history. */
  archivedBy?: string;
};

type EventNode =
  | { kind: 'created'; contract: Contract }
  | {
      kind: 'exercised';
      contractId: string;
      templateId: string;
      choice: string;
      actingParty: string;
      consuming: boolean;
      witnesses: string[];
    };

type Update = { updateId: string; offset: number; recordTime: string; events: EventNode[] };

/** `#continuum-contracts:Continuum.Deal:ContinuationDeal` → `Continuum.Deal:ContinuationDeal`. */
const entityOf = (templateId: string): string => templateId.split(':').slice(1).join(':');
const shortOf = (templateId: string): string => entityOf(templateId).split(':')[1] ?? 'contract';

const P = '#continuum-contracts';
const T = {
  deal: `${P}:Continuum.Deal:ContinuationDeal`,
  disclosure: `${P}:Continuum.Deal:FairnessDisclosure`,
  receipt: `${P}:Continuum.Deal:SettlementReceipt`,
  holding: `${P}:Continuum.Registry:RegistryHolding`,
  alloc: `${P}:Continuum.Registry:RegistryAllocation`,
  execDeleg: `${P}:Continuum.Registry:ExecDelegation`,
  interest: `${P}:Continuum.Participation:OldFundInterest`,
  accPart: `${P}:Continuum.Participation:AcceptedParticipation`,
  consent: `${P}:Continuum.Consent:LPACConsent`,
} as const;

/** Registry.daml pins the CV instrument id as a constant. */
const UNIT_ID = 'MERIDIAN-CV-I';
/**
 * Close sums the legs whose instrument is the CV unit. On-ledger that test is
 * `iid == unitId` against the hardcoded constant; the demo epoch (Reset) mints
 * `MERIDIAN-CV-I-2`, `-3`… so a literal reproduction would make every post-reset close
 * fail the conservation assert. The sandbox matches the epoch-suffixed ids too, so Reset
 * stays usable for UI work. (Worth checking upstream: on devnet, a close after Reset
 * looks like it would abort.)
 */
const isUnit = (instId: string): boolean => instId === UNIT_ID || instId.startsWith(`${UNIT_ID}-`);

const num = (v: unknown): number => Number(v ?? 0);
/** Daml Decimals ride the wire as strings; keep the ledger's own formatting. */
const dec = (n: number): string => (Number.isInteger(n) ? `${n}.0` : String(n));
const roundDollar = (n: number): number => Math.round(n);
/** `subDate a b` — whole days between two ISO dates. */
const subDate = (a: string, b: string): number =>
  Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000);

const fail = (msg: string): never => {
  throw new Error(msg);
};
const assert = (cond: unknown, msg: string): void => {
  if (!cond) fail(msg);
};

/** signatory / observer clauses, verbatim from the Daml. This IS the privacy model. */
function projectionOf(templateId: string, a: Record<string, any>, submitter: string): Pick<Contract, 'signatories' | 'observers'> {
  const parties = (...xs: unknown[]): string[] => [
    ...new Set(xs.flat().filter((x): x is string => typeof x === 'string' && x.length > 0)),
  ];
  const proj = (sig: unknown[], obs: unknown[] = []) => ({
    signatories: parties(...sig),
    observers: parties(...obs).filter((o) => !parties(...sig).includes(o)),
  });

  switch (entityOf(templateId)) {
    // Deal
    case 'Continuum.Deal:ContinuationDeal':
      return proj([a.gp, a.vehicle], [a.room ?? [], a.regulator, a.lpac]);
    case 'Continuum.Deal:FairnessDisclosure':
      return proj([a.gp], [a.lpac, a.regulator]);
    case 'Continuum.Deal:SettlementReceipt':
      return proj([a.gp], [a.room ?? []]);
    // Auction — the sealed bid has NO observers: blind to peers AND to the GP.
    case 'Continuum.Auction:SealedBid':
      return proj([a.buyer]);
    case 'Continuum.Auction:BidFiled':
      return proj([a.buyer], [a.gp, a.lpac]);
    case 'Continuum.Auction:AuctionCertificate':
      return proj([a.gp], [a.lpac]);
    // Election — likewise blind; only the contentless marker reaches the GP.
    case 'Continuum.Election:LPElection':
      return proj([a.lp]);
    case 'Continuum.Election:ElectionFiled':
      return proj([a.lp], [a.gp]);
    // Consent
    case 'Continuum.Consent:LPACConsentRequest':
      return proj([a.gp], [a.lpac]);
    case 'Continuum.Consent:LPACConsent':
      return proj([a.lpac], [a.gp]);
    // Valuation
    case 'Continuum.Valuation:ValuationReport':
      return proj([a.agent], [a.gp]);
    case 'Continuum.Valuation:FairnessOpinion':
      return proj([a.provider], [a.gp, a.lpac]);
    // Issuance
    case 'Continuum.Issuance:IssuanceBasis':
      return proj([a.gp]);
    case 'Continuum.Issuance:PurchaseAgreement':
      return proj([a.oldFund, a.vehicle]);
    // Registry
    case 'Continuum.Registry:RegistryHolding':
      return proj([a.admin], [a.owner]);
    case 'Continuum.Registry:RegistryAllocationFactory':
      return proj([a.admin]);
    case 'Continuum.Registry:RegistryAllocation':
      return proj(
        [a.admin],
        [a.spec?.transferLeg?.sender, a.spec?.transferLeg?.receiver, a.spec?.settlement?.executor],
      );
    case 'Continuum.Registry:ExecDelegationProposal':
      return proj([a.admin], [a.party]);
    case 'Continuum.Registry:ExecDelegation':
      return proj([a.admin, a.party]);
    // Participation
    case 'Continuum.Participation:OldFundInterestOffer':
      return proj([a.oldFund], [a.lp]);
    case 'Continuum.Participation:OldFundInterest':
      return proj([a.oldFund, a.lp]);
    case 'Continuum.Participation:DealParticipation':
      return proj([a.lp], [a.gp]);
    case 'Continuum.Participation:AcceptedParticipation':
      return proj([a.gp, a.lp]);
    // Settlement / credential / document
    case 'Continuum.Settlement:TransferLegRequest':
      return proj([a.gp], [a.sender, a.receiver]);
    case 'Continuum.Credential:EligibilityCredential':
      return proj([a.issuer], [a.holder]);
    case 'Continuum.Document:SignedDocument':
      return proj([a.attestor]);
    default:
      return proj([submitter]);
  }
}

/** The three choices the UI exercises that do NOT archive their target. */
const NONCONSUMING = new Set(['ExecFor', 'BurnFor', 'FetchDoc', 'ProbeBurn', 'Reveal']);

export class FakeLedger {
  private contracts: Contract[] = [];
  private updates: Update[] = [];
  private seq = 0;

  offset(): number {
    return this.updates.length;
  }

  /**
   * Submit as `party` — the spine has already pinned this to the session tenant, so the
   * acting party is trustworthy here exactly as a signature would make it on-ledger.
   * A throw anywhere in the batch rolls the whole submit back: atomicity, as promised.
   */
  submit(party: string, commands: JsCommand[]): string {
    const snapshot = this.contracts.map((c) => ({ ...c }));
    const updateId = `sbx-update-${this.updates.length + 1}`;
    const events: EventNode[] = [];
    try {
      for (const cmd of commands) {
        if ('CreateCommand' in cmd) {
          const { templateId, createArguments } = cmd.CreateCommand;
          const contract = this.create(templateId, createArguments as Record<string, any>, party);
          events.push({ kind: 'created', contract });
        } else {
          const { contractId, choice, choiceArgument } = cmd.ExerciseCommand;
          this.exercise(party, contractId, choice, (choiceArgument ?? {}) as Record<string, any>, updateId, events);
        }
      }
    } catch (e) {
      this.contracts = snapshot; // nested failure aborts the whole transaction
      throw e;
    }
    this.updates.push({ updateId, offset: this.updates.length + 1, recordTime: new Date().toISOString(), events });
    return updateId;
  }

  /** Typed ACS read (the valuation seed's idempotency port). */
  activeContracts(party: string, templateSuffix?: string): ActiveContract[] {
    return this.visible(party, templateSuffix).map((c) => ({
      contractId: c.contractId,
      templateId: c.templateId,
      args: c.args,
    }));
  }

  /** ACS in the JSON Ledger API v2 envelope HttpLedgerClient unwraps. */
  activeContractsRaw(party: string): unknown[] {
    return this.visible(party).map((c) => ({
      contractEntry: {
        JsActiveContract: {
          createdEvent: {
            contractId: c.contractId,
            templateId: c.templateId,
            createArgument: c.args,
            createdEventBlob: '',
            signatories: c.signatories,
            observers: c.observers,
          },
          synchronizerId: 'sandbox::synchronizer',
        },
      },
    }));
  }

  /** The Ledger Inspector's proof: one committed transaction, projected to `party`. */
  updateById(updateId: string, party: string): unknown | null {
    const u = this.updates.find((x) => x.updateId === updateId);
    if (!u) return null;
    const events = u.events
      .filter((e) =>
        e.kind === 'created'
          ? [...e.contract.signatories, ...e.contract.observers].includes(party)
          : e.witnesses.includes(party),
      )
      .map((e, i) =>
        e.kind === 'created'
          ? {
              CreatedTreeEvent: {
                value: {
                  offset: u.offset,
                  nodeId: i,
                  contractId: e.contract.contractId,
                  templateId: e.contract.templateId,
                  createArgument: e.contract.args,
                  signatories: e.contract.signatories,
                  observers: e.contract.observers,
                  witnessParties: [...e.contract.signatories, ...e.contract.observers],
                },
              },
            }
          : {
              ExercisedTreeEvent: {
                value: {
                  offset: u.offset,
                  nodeId: i,
                  contractId: e.contractId,
                  templateId: e.templateId,
                  choice: e.choice,
                  actingParties: [e.actingParty],
                  consuming: e.consuming,
                  witnessParties: e.witnesses,
                },
              },
            },
      );
    return {
      update: {
        Transaction: {
          value: {
            updateId: u.updateId,
            commandId: `sbx-cmd-${u.offset}`,
            workflowId: '',
            effectiveAt: u.recordTime,
            recordTime: u.recordTime,
            offset: u.offset,
            synchronizerId: 'sandbox::synchronizer',
            events,
          },
        },
      },
    };
  }

  // ── internals ────────────────────────────────────────────────────────────────

  private visible(party: string, templateSuffix?: string): Contract[] {
    return this.contracts.filter(
      (c) =>
        !c.archivedBy &&
        (c.signatories.includes(party) || c.observers.includes(party)) &&
        (!templateSuffix || c.templateId.endsWith(templateSuffix)),
    );
  }

  private active(contractId: string): Contract {
    const c = this.contracts.find((x) => x.contractId === contractId);
    if (!c) fail(`contract ${contractId} not found`);
    if (c!.archivedBy) fail(`contract ${contractId} is already archived`);
    return c!;
  }

  private create(templateId: string, args: Record<string, any>, submitter: string): Contract {
    const contract: Contract = {
      contractId: `sbx-${shortOf(templateId).toLowerCase()}-${++this.seq}`,
      templateId,
      args,
      ...projectionOf(templateId, args, submitter),
    };
    this.contracts.push(contract);
    return contract;
  }

  private exercise(
    party: string,
    contractId: string,
    choice: string,
    arg: Record<string, any>,
    updateId: string,
    events: EventNode[],
  ): void {
    const target = this.active(contractId);
    events.push({
      kind: 'exercised',
      contractId,
      templateId: target.templateId,
      choice,
      actingParty: party,
      consuming: !NONCONSUMING.has(choice),
      witnesses: [...target.signatories, ...target.observers],
    });

    const a = target.args;
    const create = (templateId: string, args: Record<string, any>, submitter = party): Contract => {
      const c = this.create(templateId, args, submitter);
      events.push({ kind: 'created', contract: c });
      return c;
    };
    const archive = (c: Contract) => {
      c.archivedBy = updateId;
    };
    /** Controller check — exercising a choice you don't control fails, as on-ledger. */
    const controller = (who: string) =>
      assert(party === who, `${choice}: controller is ${who.split('::')[0]}, not ${party.split('::')[0]}`);
    /** Consuming recreate: `create this with …` — new contract id, same stakeholders. */
    const recreate = (patch: Record<string, any>) => {
      archive(target);
      return create(target.templateId, { ...a, ...patch }, target.signatories[0]);
    };

    switch (`${entityOf(target.templateId)}.${choice}`) {
      // ── ContinuationDeal — the stage machine ────────────────────────────────
      case 'Continuum.Deal:ContinuationDeal.Break': {
        controller(a.gp);
        assert(a.stage !== 'Closed' && a.stage !== 'Broken', 'already terminal');
        recreate({ stage: 'Broken' });
        return;
      }
      case 'Continuum.Deal:ContinuationDeal.RecordConsent': {
        controller(a.lpac); // the LPAC consents — not the GP
        assert(a.stage !== 'Closed' && a.stage !== 'Broken', 'terminal');
        recreate({ stage: 'Consented' });
        return;
      }
      case 'Continuum.Deal:ContinuationDeal.SetClearing': {
        controller(a.gp);
        assert(a.stage !== 'Closed' && a.stage !== 'Broken', 'terminal');
        recreate({ clearingPrice: arg.p }); // stage unchanged
        return;
      }
      case 'Continuum.Deal:ContinuationDeal.OpenElections': {
        controller(a.gp);
        assert(a.stage === 'Consented', 'elections need LPAC consent first');
        assert(a.clearingPrice != null, 'elections need the clearing price published');
        recreate({ stage: 'Electing' });
        return;
      }
      case 'Continuum.Deal:ContinuationDeal.Close': {
        controller(a.gp);
        assert(a.stage === 'Consented' || a.stage === 'Electing', 'must be consented/electing');

        const basis = this.active(arg.basisCid);
        assert(basis.args.gp === a.gp, 'issuance basis is for a different gp');

        // (1) the antecedent DAG — valuation + fairness + auction cert + LPAC consent + PSA.
        //     ValidateIssuance is CONSUMING: the basis is spent by the close.
        this.validateIssuance(basis, party, updateId, events);

        // (2) read the legs BEFORE executing them, and enforce conservation on-ledger:
        //     units issued must equal the PSA price, or nothing happens at all.
        const legExecs: Array<{ _1: string; _2: string }> = arg.legExecs ?? [];
        const legs = legExecs.map(({ _2 }) => {
          const allocation = this.active(_2);
          return {
            instId: String(allocation.args.spec?.transferLeg?.instrumentId?.id ?? ''),
            amount: num(allocation.args.reserved),
          };
        });
        const unitTotal = legs.filter((l) => isUnit(l.instId)).reduce((s, l) => s + l.amount, 0);
        assert(unitTotal === num(basis.args.psaPrice), 'units issued must equal the PSA price');

        // (3) execute every pre-signed leg, (4) burn each co-signed old-fund interest.
        for (const { _1: delegCid, _2: allocCid } of legExecs) {
          this.exercise(party, delegCid, 'ExecFor', { allocCid }, updateId, events);
        }
        for (const { _1: accPartCid, _2: interestCid } of (arg.burns ?? []) as Array<{ _1: string; _2: string }>) {
          this.exercise(party, accPartCid, 'BurnFor', { interestCid }, updateId, events);
        }

        // (5) the disclosures: aggregates to the LPAC/regulator, a receipt to the room.
        create(T.disclosure, {
          gp: a.gp,
          lpac: a.lpac,
          regulator: a.regulator,
          dealId: a.cv,
          clearingPct: basis.args.clearingPct,
          totalUnits: dec(unitTotal),
          fairnessHash: arg.fairnessHash,
        });
        create(T.receipt, {
          gp: a.gp,
          room: a.room ?? [],
          dealId: a.cv,
          clearingPct: basis.args.clearingPct,
          totalUnits: dec(unitTotal),
        });
        recreate({ stage: 'Closed' });
        return;
      }

      // ── Registry ────────────────────────────────────────────────────────────
      case 'Continuum.Registry:RegistryAllocationFactory.AllocationFactory_Allocate': {
        controller(a.admin);
        assert(arg.expectedAdmin === a.admin, 'wrong admin');
        const spec = arg.allocation;
        const leg = spec.transferLeg;
        const inputs = ((arg.inputHoldingCids ?? []) as string[]).map((cid) => this.active(cid));
        for (const h of inputs) {
          assert(h.args.owner === leg.sender, 'wrong owner');
          assert(h.args.instId === leg.instrumentId.id, 'wrong instrument');
          assert(!h.args.locked, 'holding locked');
          archive(h);
        }
        const total = inputs.reduce((s, h) => s + num(h.args.amount), 0);
        assert(total >= num(leg.amount), 'insufficient holdings for allocation');
        create(T.alloc, { admin: a.admin, spec, reserved: leg.amount });
        if (total > num(leg.amount)) {
          create(T.holding, {
            admin: a.admin,
            owner: leg.sender,
            instId: leg.instrumentId.id,
            amount: dec(total - num(leg.amount)),
            locked: false,
            meta_: {},
          });
        }
        return;
      }
      case 'Continuum.Registry:ExecDelegationProposal.EDP_Accept': {
        controller(a.party); // the delegating party signs its own delegation
        archive(target);
        create(T.execDeleg, { admin: a.admin, party: a.party });
        return;
      }
      case 'Continuum.Registry:ExecDelegation.ExecFor': {
        controller(a.admin);
        const allocation = this.active(arg.allocCid);
        const leg = allocation.args.spec.transferLeg;
        // The delegation carries the co-signature the leg's {sender, receiver, executor}
        // controller set needs — this is the whole point of the propose-accept dance.
        assert(
          [leg.sender, leg.receiver, allocation.args.spec.settlement.executor].includes(a.party) ||
            a.party === a.admin,
          'delegation does not cover this leg',
        );
        events.push({
          kind: 'exercised',
          contractId: allocation.contractId,
          templateId: allocation.templateId,
          choice: 'Allocation_ExecuteTransfer',
          actingParty: party,
          consuming: true,
          witnesses: [...allocation.signatories, ...allocation.observers],
        });
        archive(allocation);
        create(T.holding, {
          admin: allocation.args.admin,
          owner: leg.receiver,
          instId: leg.instrumentId.id,
          amount: allocation.args.reserved,
          locked: false,
          meta_: leg.meta?.values ?? {},
        });
        return;
      }

      // ── Participation ───────────────────────────────────────────────────────
      case 'Continuum.Participation:OldFundInterestOffer.OFI_Accept': {
        controller(a.lp);
        archive(target);
        create(T.interest, { oldFund: a.oldFund, lp: a.lp, nav: a.nav });
        return;
      }
      case 'Continuum.Participation:DealParticipation.Accept': {
        controller(a.gp); // the LP proposed; the GP accepts
        archive(target);
        create(T.accPart, { gp: a.gp, lp: a.lp });
        return;
      }
      case 'Continuum.Participation:AcceptedParticipation.BurnFor': {
        controller(a.gp);
        const interest = this.active(arg.interestCid);
        assert(interest.args.lp === a.lp, 'wrong lp');
        events.push({
          kind: 'exercised',
          contractId: interest.contractId,
          templateId: interest.templateId,
          choice: 'Archive',
          actingParty: party,
          consuming: true,
          witnesses: [...interest.signatories, ...interest.observers],
        });
        archive(interest);
        return;
      }

      // ── Consent / Auction / Election ────────────────────────────────────────
      case 'Continuum.Consent:LPACConsentRequest.Grant': {
        controller(a.lpac);
        const markers = ((arg.bidMarkerCids ?? []) as string[]).map((cid) => this.active(cid));
        const bidders = [...new Set(markers.map((m) => m.args.buyer))];
        const conflicted = (a.memberRoster ?? []).filter((m: string) => bidders.includes(m));
        assert(
          conflicted.every((m: string) => (a.recusals ?? []).includes(m)),
          'recusals must cover every bidding LPAC member',
        );
        archive(target);
        create(T.consent, { gp: a.gp, lpac: a.lpac, dealId: a.dealId, recusals: a.recusals ?? [], granted: true });
        return;
      }
      case 'Continuum.Auction:SealedBid.Withdraw': {
        controller(a.buyer);
        archive(target);
        return;
      }
      case 'Continuum.Election:LPElection.Amend': {
        controller(a.lp);
        assert(
          num(arg.newRoll) >= 0 && num(arg.newSell) >= 0 && num(arg.newRoll) + num(arg.newSell) === num(a.positionNav),
          'roll + sell must equal the position',
        );
        recreate({ rollNav: arg.newRoll, sellNav: arg.newSell });
        return;
      }
      case 'Continuum.Credential:EligibilityCredential.Revoke': {
        controller(a.issuer);
        recreate({ valid: false });
        return;
      }

      default:
        fail(`sandbox ledger: choice ${choice} on ${entityOf(target.templateId)} is not implemented`);
    }
  }

  /** The antecedent-DAG gate. Consuming: a close spends the basis. */
  private validateIssuance(basis: Contract, party: string, updateId: string, events: EventNode[]): void {
    const b = basis.args;
    events.push({
      kind: 'exercised',
      contractId: basis.contractId,
      templateId: basis.templateId,
      choice: 'ValidateIssuance',
      actingParty: party,
      consuming: true,
      witnesses: [...basis.signatories, ...basis.observers],
    });

    assert(num(b.psaPrice) === roundDollar(num(b.clearingPct) * num(b.reconciledNav)), 'psaPrice != clearing × reconciledNav');

    const valuations = (b.valuationCids ?? []) as string[];
    assert(valuations.length > 0, 'no valuation');
    for (const cid of valuations) {
      const v = this.active(cid).args;
      assert(v.dealId === b.dealId && v.gp === b.gp, 'valuation not for this deal');
      assert(num(v.navLow) <= num(b.reconciledNav) && num(b.reconciledNav) <= num(v.navHigh), 'reconciledNav outside a valuation range');
      const age = subDate(b.closeDate, v.asOfDate);
      assert(age >= 0 && age <= num(b.maxAsOfDays), 'valuation stale or future-dated');
    }

    const f = this.active(b.fairnessCid).args;
    assert(f.dealId === b.dealId && f.gp === b.gp, 'fairness not for this deal');
    assert(num(f.fairLow) <= num(b.clearingPct) && num(b.clearingPct) <= num(f.fairHigh), 'clearing outside fairness range');
    const fAge = subDate(b.closeDate, f.opinionDate);
    assert(fAge >= 0 && fAge <= num(b.maxAsOfDays), 'fairness stale or future-dated');

    const cert = this.active(b.auctionCertCid).args;
    assert(cert.dealId === b.dealId && cert.gp === b.gp, 'auction cert not for this deal');
    assert(num(cert.clearingPct) === num(b.clearingPct), 'auction cert clearing mismatch');

    const consent = this.active(b.lpacConsentCid).args;
    assert(consent.dealId === b.dealId && consent.gp === b.gp, 'LPAC consent not for this deal');
    assert(consent.granted, 'LPAC not granted');

    const psa = this.active(b.psaCid).args;
    assert(psa.dealId === b.dealId && psa.oldFund === b.gp && psa.vehicle === b.gp, 'PSA not for this deal');
    assert(num(psa.price) === num(b.psaPrice) && num(psa.clearingPct) === num(b.clearingPct), 'PSA price mismatch');

    basis.archivedBy = updateId;
  }
}

export { entityOf, isUnit, roundDollar };
export type { Contract };
