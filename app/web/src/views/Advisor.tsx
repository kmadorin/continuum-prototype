// Advisor / Organizer (role `gp`) — runs the deal. Every write is signed by the
// GP's custodian (POST /action — the backend signs with the GP party's key). Two sections:
//
//  1. Closing room  — the deal lifecycle: create ContinuationDeal, SetClearing,
//     OpenElections. (RecordConsent is lpac-controlled in 1.1.0, so it lives in
//     the LPAC tab; OpenElections is gated on the deal being Consented there.)
//
//  2. Settlement    — the GP-signable backstage that feeds the atomic Close,
//     ported step-for-step from app/scripts/close-wallets.ts: create the registry
//     factory, auction certificate, purchase agreement, mint + allocate the two
//     legs, assemble the IssuanceBasis, propose the exec-delegations, offer the
//     old-fund interest — then fire Close, reading every required contract id
//     from the GP's own ACS.
//
// The counterparty ACCEPT steps (buyer/LP EDP_Accept, LP OFI_Accept, LP
// DealParticipation) are signed in those roles' OWN tabs — a single browser tab
// can only sign as one party. So a one-tab Close will surface exactly which
// cross-party contracts are still missing; the coordinated live 5-party close is
// Task 9. Nothing here is faked: each button is a real, party-signed command.
import { useState } from 'react';
import type { ActiveContract, JsCommand } from '../../../ledger-client/src/types';
import { useLedger, T, R, counter, DEAL_ID, DEMO, shortParty } from '../lib/useLedger';
import { useInspector } from '../state/Inspector';
import { truncHash } from '../lib/docs';
import IssueUnitsGate, { type GateCheck } from '../components/IssueUnitsGate';
import SliderField from '../components/SliderField';
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

// `embedded` lets the shared Deal Page mount only the cards for a given tab (and
// hides the standalone StageHead + deal-summary chrome the page already supplies).
// Absent → the full standalone workspace (used by the persona smoke tests).
export type AdvisorSection = 'clearing' | 'elections' | 'ceremony' | 'settlement' | 'close';

export default function Advisor({ embedded }: { embedded?: AdvisorSection[] } = {}) {
  const bare = !!embedded;
  const show = (s: AdvisorSection) => !embedded || embedded.includes(s);
  const L = useLedger();
  const inspector = useInspector();
  const { busy, err, note, run } = useAction();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [have, setHave] = useState<Record<string, boolean>>({});
  const [price, setPrice] = useState<string>(DEMO.clearingPct);
  // Ceremony state: the on-chain FACTS behind each gate check + issuance outcome.
  const [receipt, setReceipt] = useState<ActiveContract | null>(null);
  const [closeUpdateId, setCloseUpdateId] = useState<string | null>(null);
  const [facts, setFacts] = useState<{
    valuationHash: string;
    fairnessHash: string;
    clearingPct: number | null;
    consentGranted: boolean;
    unitsToIssue: number;
  }>({ valuationHash: '', fairnessHash: '', clearingPct: null, consentGranted: false, unitsToIssue: Number(DEMO.psaPrice) });

  // Read the GP's own ACS: the deal + presence of each settlement antecedent so
  // the stepper reflects real on-ledger state, not local flags.
  const refresh = async (alive: () => boolean = () => true) => {
    const forDeal = (c: ActiveContract) => c.args.dealId === DEAL_ID;
    const [d, factory, cert, psa, basis, allocs, valuation, opinion, consent, interestOffer, receiptC] =
      await Promise.all([
        L.myAcs(R.deal),
        L.myAcs(R.factory),
        L.myAcs(R.cert),
        L.myAcs(R.psa),
        L.myAcs(R.basis),
        L.myAcs(R.alloc),
        L.myAcs(R.valuation),
        L.myAcs(R.opinion),
        L.myAcs(R.consent),
        L.myAcs(R.interestOffer),
        L.myAcs(R.receipt),
      ]);
    if (!alive()) return;
    setDeal(pick(d, (c) => c.args.cv === DEMO.cv));
    const legId = (c: ActiveContract) => (c.args.spec as { transferLegId?: string })?.transferLegId;
    const valC = pick(valuation, forDeal);
    const opC = pick(opinion, forDeal);
    const certC = pick(cert, forDeal);
    const consC = pick(consent, forDeal);
    const psaC = pick(psa, forDeal);
    const basisC = pick(basis, forDeal);
    setHave({
      factory: !!pick(factory, (c) => c.args.admin === L.me),
      cert: !!certC,
      psa: !!psaC,
      basis: !!basisC,
      allocUnit: !!pick(allocs, (c) => legId(c) === 'unit-buyer'),
      allocRoll: !!pick(allocs, (c) => legId(c) === 'unit-roller'),
      allocCash: !!pick(allocs, (c) => legId(c) === 'cash-lp'),
      valuation: !!valC,
      opinion: !!opC,
      // Consent counts only when the LPAC actually GRANTED it (not merely present).
      consent: !!consC && (consC.args.granted as boolean) !== false,
      interestExiting: !!pick(interestOffer, (c) => c.args.lp === counter.lpExiting),
      interestRolling: !!pick(interestOffer, (c) => c.args.lp === counter.lpRolling),
    });
    setReceipt(pick(receiptC, forDeal) ?? pick(receiptC));
    setFacts({
      valuationHash: (valC?.args.contentHash as string) || '',
      fairnessHash: (opC?.args.contentHash as string) || '',
      clearingPct: certC ? Number(certC.args.clearingPct) : null,
      consentGranted: !!consC && (consC.args.granted as boolean) !== false,
      unitsToIssue: Number(basisC?.args.psaPrice ?? psaC?.args.price ?? DEMO.psaPrice),
    });
  };
  useRefresh(refresh, [L.me]);

  const stage = (deal?.args.stage as string) ?? null;

  // ── deal lifecycle ──────────────────────────────────────────────────────────
  const openRoom = () =>
    run('open', async () => {
      await L.submit(
        [
          {
            CreateCommand: {
              templateId: T.deal,
              createArguments: {
                gp: L.me,
                vehicle: L.me,
                oldFund: L.me,
                lpac: counter.lpac,
                regulator: counter.lpac,
                room: [counter.buyer, counter.lpExiting, counter.lpRolling],
                fund: DEMO.fund,
                cv: DEMO.cv,
                asset: DEMO.asset,
                refNav: DEMO.refNav,
                electionDeadline: DEMO.electionDeadline,
                clearingPrice: null,
                gpCommitment: '0.0',
                carryCrystallized: '0.0',
                stage: 'Setup',
              },
            },
          },
        ],
        R.deal,
      );
      await refresh();
      return 'Closing room opened — deal created and signed by the GP custodian.';
    });

  /**
   * The CURRENT deal cid, re-read at the moment of use.
   *
   * Every ContinuationDeal choice is consuming — `create this with …` — so the contract id
   * changes on each one, including the LPAC's `RecordConsent`, which is exercised in ANOTHER
   * session. A GP acting on the id it cached at page load would then submit against an
   * archived contract and fail for reasons that look like nothing to do with what it clicked.
   */
  const currentDealCid = async (): Promise<string> => {
    const d = pick(await L.myAcs(R.deal), (c) => c.args.cv === DEMO.cv);
    if (!d) throw new Error('Open the closing room first.');
    return d.contractId;
  };

  const exerciseDeal = (label: string, choice: string, arg: Record<string, unknown>, ok: string) =>
    run(label, async () => {
      await L.submit(
        [{ ExerciseCommand: { templateId: T.deal, contractId: await currentDealCid(), choice, choiceArgument: arg } }],
        R.deal,
      );
      await refresh();
      return ok;
    });

  const setClearing = () => exerciseDeal('price', 'SetClearing', { p: price }, 'Clearing price set and disclosed to the room.');
  const openElections = () =>
    exerciseDeal('elect', 'OpenElections', {}, 'Elections open — LPs can now file their roll/sell decisions.');

  // ── settlement helpers (all GP-signed) ──────────────────────────────────────
  const create = (templateId: string, createArguments: Record<string, unknown>): JsCommand[] => [
    { CreateCommand: { templateId, createArguments } },
  ];

  const step = (label: string, ok: string, fn: () => Promise<void>) =>
    run(label, async () => {
      await fn();
      await refresh();
      return ok;
    });

  const createFactory = () =>
    step('factory', 'Registry allocation factory created.', async () => {
      await L.submit(create(T.factory, { admin: L.me }), R.factory);
    });

  const createCert = () =>
    step('cert', 'Auction certificate signed.', async () => {
      await L.submit(
        create(
          T.cert,
          { gp: L.me, lpac: counter.lpac, dealId: DEAL_ID, clearingPct: DEMO.clearingPct, leadBuyer: counter.buyer, bidTabulationHash: DEMO.contentHash },
        ),
        R.cert,
      );
    });

  const createPsa = () =>
    step('psa', 'Purchase agreement signed.', async () => {
      await L.submit(
        create(
          T.psa,
          { oldFund: L.me, vehicle: L.me, dealId: DEAL_ID, price: DEMO.psaPrice, refNav: DEMO.refNav, clearingPct: DEMO.clearingPct, asOfDate: DEMO.closeDate },
        ),
        R.psa,
      );
    });

  const allocateLeg = async (receiver: string, instId: string, amount: string, legId: string) => {
    const factoryCid = pick(await L.myAcs(R.factory), (c) => c.args.admin === L.me)?.contractId;
    if (!factoryCid) throw new Error('Create the registry allocation factory first.');
    const mint = await L.submit(create(T.holding, { admin: L.me, owner: L.me, instId, amount, locked: false, meta_: {} }), R.holding);
    const holdingCid = mint.contract?.contractId;
    if (!holdingCid) throw new Error('Minted holding did not appear in the GP ACS.');
    const NOW = new Date().toISOString();
    const spec = {
      settlement: { executor: L.me, settlementRef: { id: legId, cid: null }, requestedAt: NOW, allocateBefore: NOW, settleBefore: NOW, meta: { values: {} } },
      transferLegId: legId,
      transferLeg: { sender: L.me, receiver, amount, instrumentId: { admin: L.me, id: instId }, meta: { values: {} } },
    };
    await L.submit(
      [
        {
          ExerciseCommand: {
            templateId: T.allocFactoryIface,
            contractId: factoryCid,
            choice: 'AllocationFactory_Allocate',
            choiceArgument: { expectedAdmin: L.me, allocation: spec, requestedAt: NOW, inputHoldingCids: [holdingCid], extraArgs: { context: { values: {} }, meta: { values: {} } } },
          },
        },
      ],
      R.alloc,
    );
  };

  // The three legs. The two UNIT legs sum to the PSA price — Deal.daml's Close asserts it
  // on-ledger, so an incoherent cap table cannot settle: it aborts the whole transaction.
  const allocUnit = () =>
    step('allocUnit', 'Unit leg minted + allocated to the buyer.', () =>
      allocateLeg(counter.buyer, DEMO.unit, DEMO.buyerUnits, 'unit-buyer'),
    );
  const allocRoll = () =>
    step('allocRoll', 'Rolled-unit leg minted + allocated to the rolling LP.', () =>
      allocateLeg(counter.lpRolling, DEMO.unit, DEMO.rollerUnits, 'unit-roller'),
    );
  const allocCash = () =>
    step('allocCash', 'Cash leg minted + allocated to the exiting LP.', () =>
      allocateLeg(counter.lpExiting, DEMO.usdc, DEMO.cashAmt, 'cash-lp'),
    );

  const createBasis = () =>
    step('basis', 'Issuance basis assembled from the antecedent DAG.', async () => {
      const cid = async (suffix: string, pred: (c: ActiveContract) => boolean) => {
        const c = pick(await L.myAcs(suffix), pred);
        if (!c) throw new Error(`Missing antecedent (${suffix}). Have the valuer anchor the valuation, LPAC sign fairness + grant consent, and create the certificate + PSA first.`);
        return c.contractId;
      };
      const forDeal = (c: ActiveContract) => c.args.dealId === DEAL_ID;
      const vrCid = await cid(R.valuation, forDeal);
      const foCid = await cid(R.opinion, forDeal);
      const acCid = await cid(R.cert, forDeal);
      const lcCid = await cid(R.consent, forDeal);
      const psaCid = await cid(R.psa, forDeal);
      await L.submit(
        create(
          T.basis,
          {
            gp: L.me,
            dealId: DEAL_ID,
            reconciledNav: DEMO.reconciledNav,
            clearingPct: DEMO.clearingPct,
            psaPrice: DEMO.psaPrice,
            reconciliation: 'InRangeOfAll',
            valuationCids: [vrCid],
            fairnessCid: foCid,
            auctionCertCid: acCid,
            lpacConsentCid: lcCid,
            psaCid,
            closeDate: DEMO.closeDate,
            maxAsOfDays: '120',
          },
        ),
        R.basis,
      );
    });

  const proposeDelegation = (party: string, who: string) =>
    step(`deleg-${who}`, `Execution delegation proposed to the ${who}.`, async () => {
      await L.submit(create(T.execDelegProp, { admin: L.me, party }), R.execDelegProp);
    });

  // Both LPs leave the old fund — the seller for cash, the roller for units — so both
  // hand back an old-fund interest for the close to burn.
  const offerInterest = (lp: string, nav: string, who: string) =>
    step(`interest-${who}`, `Old-fund interest offered to the ${who}.`, async () => {
      await L.submit(create(T.interestOffer, { oldFund: L.me, lp, nav }), R.interestOffer);
    });

  const acceptParticipation = (lp: string, who: string) =>
    step(`accpart-${who}`, `${who} participation accepted.`, async () => {
      const dp = pick(await L.myAcs(R.dealPart), (c) => c.args.lp === lp);
      if (!dp) throw new Error(`No DealParticipation from the ${who} yet — they propose it in their tab.`);
      await L.submit([{ ExerciseCommand: { templateId: T.dealPart, contractId: dp.contractId, choice: 'Accept', choiceArgument: {} } }], R.accPart);
    });

  // ── the atomic Close (GP signs alone, consuming pre-signed authority) ────────
  const close = () =>
    run('close', async () => {
      if (!deal) throw new Error('No deal to close.');
      const need = async (suffix: string, pred: (c: ActiveContract) => boolean, what: string) => {
        const c = pick(await L.myAcs(suffix), pred);
        if (!c) throw new Error(`Close blocked: missing ${what}. This contract is created/accepted in another role's tab — the coordinated live close is Task 9.`);
        return c.contractId;
      };
      const forDeal = (c: ActiveContract) => c.args.dealId === DEAL_ID;
      const legId = (c: ActiveContract) => (c.args.spec as { transferLegId?: string })?.transferLegId;
      const basisCid = await need(R.basis, forDeal, 'IssuanceBasis (assemble it above)');
      const execBuyerCid = await need(R.execDeleg, (c) => c.args.party === counter.buyer, "buyer's accepted ExecDelegation");
      const execExitingCid = await need(R.execDeleg, (c) => c.args.party === counter.lpExiting, "exiting LP's accepted ExecDelegation");
      const execRollingCid = await need(R.execDeleg, (c) => c.args.party === counter.lpRolling, "rolling LP's accepted ExecDelegation");
      const allocUnitCid = await need(R.alloc, (c) => legId(c) === 'unit-buyer', "allocated unit leg (buyer's)");
      const allocRollCid = await need(R.alloc, (c) => legId(c) === 'unit-roller', "allocated rolled-unit leg (rolling LP's)");
      const allocCashCid = await need(R.alloc, (c) => legId(c) === 'cash-lp', 'allocated cash leg');
      const accExitingCid = await need(R.accPart, (c) => c.args.lp === counter.lpExiting, "exiting LP's AcceptedParticipation");
      const accRollingCid = await need(R.accPart, (c) => c.args.lp === counter.lpRolling, "rolling LP's AcceptedParticipation");
      const interestExitingCid = await need(R.interest, (c) => c.args.lp === counter.lpExiting, "exiting LP's accepted OldFundInterest");
      const interestRollingCid = await need(R.interest, (c) => c.args.lp === counter.lpRolling, "rolling LP's accepted OldFundInterest");
      // Cash out, units in, rolled units in, both old interests burned — one transaction.
      const closeArg = {
        basisCid,
        legExecs: [
          { _1: execBuyerCid, _2: allocUnitCid },
          { _1: execRollingCid, _2: allocRollCid },
          { _1: execExitingCid, _2: allocCashCid },
        ],
        burns: [
          { _1: accExitingCid, _2: interestExitingCid },
          { _1: accRollingCid, _2: interestRollingCid },
        ],
        fairnessHash: DEMO.fairnessHash,
      };
      // Re-read the cid: the LPAC's consent (another session, consuming) has almost certainly
      // replaced the deal since this page loaded.
      const res = await L.submit(
        [{ ExerciseCommand: { templateId: T.deal, contractId: await currentDealCid(), choice: 'Close', choiceArgument: closeArg } }],
        R.receipt,
      );
      setCloseUpdateId(res.updateId ?? null);
      await refresh();
      return 'Close signed — one atomic transaction moved every leg and produced the settlement receipt.';
    });

  // The four LIVE gate checks — each reads this deal's on-chain state; the fact
  // strings carry the anchored proof (sha256 / clearing %) when observed.
  const ceremonyChecks: GateCheck[] = [
    {
      key: 'valuation',
      label: 'Independent valuation anchored',
      ok: !!have.valuation,
      fact: `sha256 ${truncHash(facts.valuationHash)} · Kroll`,
    },
    {
      key: 'fairness',
      label: 'Fairness opinion anchored',
      ok: !!have.opinion,
      fact: `sha256 ${truncHash(facts.fairnessHash)}`,
    },
    {
      key: 'consent',
      label: 'LPAC consent recorded',
      ok: !!have.consent,
      fact: 'LPAC recorded consent',
    },
    {
      key: 'auction',
      label: 'Auction certificate',
      ok: !!have.cert,
      fact: `clearing ${facts.clearingPct != null ? Math.round(facts.clearingPct * 100) : Math.round(Number(DEMO.clearingPct) * 100)}% of NAV`,
    },
  ];

  // One backstage step = one status row: what it is, its on-ledger state, and the
  // signing action. Done → confirmed (green, no button); blocked → the button says
  // nothing until its prerequisites exist; available → sign. Post-close, every step
  // that no longer reads as done was CONSUMED by the Close (allocations executed,
  // basis validated, authority spent) — offering to re-sign it would describe a deal
  // that has already settled.
  const dealClosed = !!receipt || stage === 'Closed';
  const StepRow = ({ id, label, done, onClick, disabled }: { id: string; label: string; done: boolean; onClick: () => void; disabled?: boolean }) => (
    <div className={`task${done || dealClosed ? ' muted' : ''}`}>
      <span className={`tk-dot${done || dealClosed ? ' done' : disabled ? ' blocked' : ''}`} aria-hidden="true" />
      <div className="tk-main">
        <span className="tk-title">{label}</span>
        <span className="tk-where">
          {done
            ? 'Signed — on-ledger'
            : dealClosed
              ? 'Spent inside the atomic Close'
              : disabled
                ? 'Blocked — prerequisites missing'
                : 'Ready to sign'}
        </span>
      </div>
      {done ? (
        <span className="chip ok">Signed</span>
      ) : dealClosed ? (
        <span className="chip ok">Consumed by the close</span>
      ) : (
        <button className="btn sm" type="button" disabled={!!busy || disabled} onClick={onClick}>
          {busy === id ? 'Signing…' : 'Sign'}
        </button>
      )}
    </div>
  );

  return (
    <div className="stack g4">
      {!bare && (
        <StageHead
          tag="ADVISOR"
          role="Organizer"
          title="Run the closing room"
          lede="One source of truth for the close, signed by your custodian on your behalf. Everyone's in the room — nobody can see anyone else's private inputs until the atomic settlement."
        />
      )}

      {!bare && (
        <Card title={deal ? (deal.args.cv as string) : DEMO.cv}>
          <dl className="kv">
            <dt>Signed in as</dt>
            <dd className="mono">{shortParty(L.me)}</dd>
            <dt>Stage</dt>
            <dd>{stage ?? <span className="chip pending">no deal yet</span>}</dd>
            <dt>Clearing price</dt>
            <dd>{deal?.args.clearingPrice ? `${fmtPct(deal.args.clearingPrice)} of NAV` : <span className="chip sealed">sealed — not yet set</span>}</dd>
            <dt>Reference NAV</dt>
            <dd>{deal ? fmtM(deal.args.refNav) : '—'}</dd>
          </dl>
        </Card>
      )}

      {show('clearing') && (
        <Card title="Set the clearing price">
          <div className="stack g3">
            <div className="actions">
              <button className="btn primary" type="button" disabled={!!busy || !!deal} onClick={openRoom}>
                {busy === 'open' ? 'Signing…' : 'Open closing room'}
              </button>
            </div>
            <div className="form-row">
              <label htmlFor="price">Clearing price — % of NAV</label>
              <SliderField
                id="price"
                min={0.8}
                max={1}
                step={0.005}
                value={price}
                onChange={setPrice}
                disabled={!deal}
                format={(n) => `${(n * 100).toFixed(1).replace(/\.0$/, '')}% of NAV`}
              />
            </div>
            <div className="actions">
              <button className="btn primary" type="button" disabled={!!busy || !deal} onClick={setClearing}>
                {busy === 'price' ? 'Signing…' : 'Set price & disclose to room'}
              </button>
            </div>
          </div>
        </Card>
      )}

      {show('elections') && (
        <Card title="Open elections">
          <div className="stack g3">
            <div className="actions">
              <button className="btn primary" type="button" disabled={!!busy || !deal || !deal.args.clearingPrice} onClick={openElections}>
                {busy === 'elect' ? 'Signing…' : 'Open elections'}
              </button>
            </div>
            <p className="hint">
              Needs the clearing price set and the deal at <span className="mono">Consented</span> — the LPAC records consent from its Approval queue.
            </p>
          </div>
        </Card>
      )}

      {show('ceremony') && (
        <IssueUnitsGate
          unitsToIssue={facts.unitsToIssue}
          checks={ceremonyChecks}
          hasBasis={!!have.basis}
          busy={busy === 'close'}
          issued={!!receipt}
          issuedUnits={receipt ? Number(receipt.args.totalUnits) : facts.unitsToIssue}
          updateId={closeUpdateId}
          onIssue={close}
          onInspect={inspector.open}
        />
      )}

      {show('settlement') && (
      <Card title="Settlement — GP-signable backstage">
        <p className="hint" style={{ marginTop: 0 }}>
          Each step is a real command signed by the GP custodian, ported from the proven close-wallets flow. The
          counterparty accepts (buyer/LP delegations, LP interest + participation) are signed in those tabs; run
          Close once they're in — the coordinated live close is Task 9.
        </p>
        <div className="taskq" style={{ marginTop: 14 }}>
          <StepRow id="factory" label="Create registry allocation factory" done={!!have.factory} onClick={createFactory} />
          <StepRow id="cert" label="Sign auction certificate" done={!!have.cert} onClick={createCert} />
          <StepRow id="psa" label="Sign purchase agreement" done={!!have.psa} onClick={createPsa} />
          <StepRow id="allocUnit" label={`Mint + allocate unit leg → buyer (${fmtM(DEMO.buyerUnits)})`} done={!!have.allocUnit} onClick={allocUnit} disabled={!have.factory} />
          <StepRow id="allocRoll" label={`Mint + allocate rolled-unit leg → rolling LP (${fmtM(DEMO.rollerUnits)})`} done={!!have.allocRoll} onClick={allocRoll} disabled={!have.factory} />
          <StepRow id="allocCash" label={`Mint + allocate cash leg → exiting LP (${fmtM(DEMO.cashAmt)})`} done={!!have.allocCash} onClick={allocCash} disabled={!have.factory} />
          <StepRow id="basis" label="Assemble issuance basis" done={!!have.basis} onClick={createBasis} disabled={!have.cert || !have.psa || !have.valuation || !have.opinion || !have.consent} />
          <StepRow id="deleg-buyer" label="Propose exec delegation → buyer" done={false} onClick={() => proposeDelegation(counter.buyer, 'buyer')} />
          <StepRow id="deleg-exiting LP" label="Propose exec delegation → exiting LP" done={false} onClick={() => proposeDelegation(counter.lpExiting, 'exiting LP')} />
          <StepRow id="deleg-rolling LP" label="Propose exec delegation → rolling LP" done={false} onClick={() => proposeDelegation(counter.lpRolling, 'rolling LP')} />
          <StepRow id="interest-exiting LP" label={`Offer old-fund interest → exiting LP (${fmtM(DEMO.exitingNav)})`} done={!!have.interestExiting} onClick={() => offerInterest(counter.lpExiting, DEMO.exitingNav, 'exiting LP')} />
          <StepRow id="interest-rolling LP" label={`Offer old-fund interest → rolling LP (${fmtM(DEMO.rollingNav)})`} done={!!have.interestRolling} onClick={() => offerInterest(counter.lpRolling, DEMO.rollingNav, 'rolling LP')} />
          <StepRow id="accpart-exiting LP" label="Accept exiting-LP participation" done={false} onClick={() => acceptParticipation(counter.lpExiting, 'exiting LP')} />
          <StepRow id="accpart-rolling LP" label="Accept rolling-LP participation" done={false} onClick={() => acceptParticipation(counter.lpRolling, 'rolling LP')} />
        </div>
      </Card>
      )}

      <ErrNote err={err} note={note} />
    </div>
  );
}
