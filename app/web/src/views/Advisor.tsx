// Advisor / Organizer (role `gp`) — runs the deal. Every write is signed by the
// GP's OWN wallet key (submitSigned(session.party, ...)). Two sections:
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
import { Card, StageHead, fmtM, fmtPct } from './shared';
import { ErrNote, pick, useAction, useRefresh } from './parts';

export default function Advisor() {
  const L = useLedger();
  const { busy, err, note, run } = useAction();
  const [deal, setDeal] = useState<ActiveContract | null>(null);
  const [have, setHave] = useState<Record<string, boolean>>({});
  const [price, setPrice] = useState<string>(DEMO.clearingPct);

  // Read the GP's own ACS: the deal + presence of each settlement antecedent so
  // the stepper reflects real on-ledger state, not local flags.
  const refresh = async (alive: () => boolean = () => true) => {
    const forDeal = (c: ActiveContract) => c.args.dealId === DEAL_ID;
    const [d, factory, cert, psa, basis, allocs, valuation, opinion, consent, interestOffer] =
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
      ]);
    if (!alive()) return;
    setDeal(pick(d, (c) => c.args.cv === DEMO.cv));
    const legId = (c: ActiveContract) => (c.args.spec as { transferLegId?: string })?.transferLegId;
    setHave({
      factory: !!pick(factory, (c) => c.args.admin === L.me),
      cert: !!pick(cert, forDeal),
      psa: !!pick(psa, forDeal),
      basis: !!pick(basis, forDeal),
      allocUnit: !!pick(allocs, (c) => legId(c) === 'unit-buyer'),
      allocCash: !!pick(allocs, (c) => legId(c) === 'cash-lp'),
      valuation: !!pick(valuation, forDeal),
      opinion: !!pick(opinion, forDeal),
      consent: !!pick(consent, forDeal),
      interestOffer: !!pick(interestOffer, (c) => c.args.lp === counter.lpExiting),
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
      return 'Closing room opened — deal created and signed by the GP wallet.';
    });

  const exerciseDeal = (label: string, choice: string, arg: Record<string, unknown>, ok: string) =>
    run(label, async () => {
      if (!deal) throw new Error('Open the closing room first.');
      await L.submit(
        [{ ExerciseCommand: { templateId: T.deal, contractId: deal.contractId, choice, choiceArgument: arg } }],
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

  const allocUnit = () => step('allocUnit', 'Unit leg minted + allocated to the buyer.', () => allocateLeg(counter.buyer, DEMO.unit, DEMO.unitAmt, 'unit-buyer'));
  const allocCash = () => step('allocCash', 'Cash leg minted + allocated to the exiting LP.', () => allocateLeg(counter.lpExiting, DEMO.usdc, DEMO.cashAmt, 'cash-lp'));

  const createBasis = () =>
    step('basis', 'Issuance basis assembled from the antecedent DAG.', async () => {
      const cid = async (suffix: string, pred: (c: ActiveContract) => boolean) => {
        const c = pick(await L.myAcs(suffix), pred);
        if (!c) throw new Error(`Missing antecedent (${suffix}). Have LPAC attest valuation/fairness/consent and create the certificate + PSA first.`);
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

  const offerInterest = () =>
    step('interest', 'Old-fund interest offered to the exiting LP.', async () => {
      await L.submit(create(T.interestOffer, { oldFund: L.me, lp: counter.lpExiting, nav: DEMO.interestNav }), R.interestOffer);
    });

  const acceptParticipation = () =>
    step('accpart', 'Exiting LP participation accepted.', async () => {
      const dp = pick(await L.myAcs(R.dealPart), (c) => c.args.lp === counter.lpExiting);
      if (!dp) throw new Error('No DealParticipation from the exiting LP yet — they propose it in their tab.');
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
      const execLpCid = await need(R.execDeleg, (c) => c.args.party === counter.lpExiting, "exiting LP's accepted ExecDelegation");
      const allocUnitCid = await need(R.alloc, (c) => legId(c) === 'unit-buyer', 'allocated unit leg');
      const allocCashCid = await need(R.alloc, (c) => legId(c) === 'cash-lp', 'allocated cash leg');
      const accLpCid = await need(R.accPart, (c) => c.args.lp === counter.lpExiting, 'AcceptedParticipation');
      const interestLpCid = await need(R.interest, (c) => c.args.lp === counter.lpExiting, "exiting LP's accepted OldFundInterest");
      const closeArg = {
        basisCid,
        legExecs: [
          { _1: execBuyerCid, _2: allocUnitCid },
          { _1: execLpCid, _2: allocCashCid },
        ],
        burns: [{ _1: accLpCid, _2: interestLpCid }],
        fairnessHash: DEMO.fairnessHash,
      };
      await L.submit([{ ExerciseCommand: { templateId: T.deal, contractId: deal.contractId, choice: 'Close', choiceArgument: closeArg } }], R.receipt);
      await refresh();
      return 'Close signed — one atomic transaction moved every leg and produced the settlement receipt.';
    });

  const StepRow = ({ id, label, done, onClick, disabled }: { id: string; label: string; done: boolean; onClick: () => void; disabled?: boolean }) => (
    <div className="actions">
      <button className="btn" type="button" disabled={!!busy || done || disabled} onClick={onClick}>
        {done ? `${label} ✓` : busy === id ? 'Signing…' : label}
      </button>
    </div>
  );

  return (
    <div className="stack g4">
      <StageHead
        tag="ADVISOR"
        role="Organizer"
        title="Run the closing room"
        lede="One source of truth for the close, signed by your own wallet. Everyone's in the room — nobody can see anyone else's private inputs until the atomic settlement."
      />

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

      <Card title="Closing room">
        <div className="stack g3">
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy || !!deal} onClick={openRoom}>
              {busy === 'open' ? 'Signing…' : 'Open closing room'}
            </button>
          </div>
          <div className="form-row">
            <label htmlFor="price">Clearing price — % of NAV</label>
            <div className="input-group">
              <input className="input" id="price" type="number" step="0.01" min="0" max="1" value={price} onChange={(e) => setPrice(e.target.value)} disabled={!deal} />
              <span className="suffix">of NAV</span>
            </div>
          </div>
          <div className="actions">
            <button className="btn" type="button" disabled={!!busy || !deal} onClick={setClearing}>
              {busy === 'price' ? 'Signing…' : 'Set price & disclose to room'}
            </button>
            <button className="btn" type="button" disabled={!!busy || !deal || !deal.args.clearingPrice} onClick={openElections}>
              {busy === 'elect' ? 'Signing…' : 'Open elections'}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 0 }}>
            Open elections needs the deal at <span className="mono">Consented</span> — the LPAC records consent in its own tab.
          </p>
        </div>
      </Card>

      <Card title="Settlement — GP-signable backstage">
        <p className="hint" style={{ marginTop: 0 }}>
          Each step is a real command signed by the GP wallet, ported from the proven close-wallets flow. The
          counterparty accepts (buyer/LP delegations, LP interest + participation) are signed in those tabs; run
          Close once they're in — the coordinated live close is Task 9.
        </p>
        <div className="stack g3" style={{ marginTop: 14 }}>
          <StepRow id="factory" label="Create registry allocation factory" done={!!have.factory} onClick={createFactory} />
          <StepRow id="cert" label="Sign auction certificate" done={!!have.cert} onClick={createCert} />
          <StepRow id="psa" label="Sign purchase agreement" done={!!have.psa} onClick={createPsa} />
          <StepRow id="allocUnit" label="Mint + allocate unit leg → buyer" done={!!have.allocUnit} onClick={allocUnit} disabled={!have.factory} />
          <StepRow id="allocCash" label="Mint + allocate cash leg → exiting LP" done={!!have.allocCash} onClick={allocCash} disabled={!have.factory} />
          <StepRow id="basis" label="Assemble issuance basis" done={!!have.basis} onClick={createBasis} disabled={!have.cert || !have.psa || !have.valuation || !have.opinion || !have.consent} />
          <StepRow id="deleg-buyer" label="Propose exec delegation → buyer" done={false} onClick={() => proposeDelegation(counter.buyer, 'buyer')} />
          <StepRow id="deleg-lp" label="Propose exec delegation → exiting LP" done={false} onClick={() => proposeDelegation(counter.lpExiting, 'exiting LP')} />
          <StepRow id="interest" label="Offer old-fund interest → exiting LP" done={!!have.interestOffer} onClick={offerInterest} />
          <StepRow id="accpart" label="Accept exiting-LP participation" done={false} onClick={acceptParticipation} />
        </div>
      </Card>

      <Card title="Close — all at once">
        <div className="actions">
          <button className="btn" type="button" disabled={!!busy || !deal || !have.basis} onClick={close}>
            {busy === 'close' ? 'Signing…' : 'Close the deal'}
          </button>
          <span className="cant-see">One atomic transaction. Signed by the GP alone, consuming every pre-signed authority.</span>
        </div>
      </Card>

      <ErrNote err={err} note={note} />
    </div>
  );
}
