/* Continuum Portal — shared/state.js
 * ---------------------------------------------------------------------------
 * The deal engine. Lifted and de-tangled from prototype/app.js. NO DOM in this
 * file — it owns the seed datasets, the 8-stage machine, election filing,
 * fairness/price, allocation compute, the atomic close (incl. forced-leg-failure
 * rollback), the flywheel, and reset().
 *
 * Stages: setup -> invite -> price -> elect -> compute -> approve
 *         -> close -> closing(transient) -> settled -> (flywheel resets)
 * The buy side prices FIRST (publicly, fairness-validated); LPs then elect roll
 * vs sell against that set price. Privacy at election is LP-vs-LP only.
 *
 * Interface (window.CT.state):
 *   get()                         -> current shared deal state
 *   deal()                        -> the static DEALS[dealNo] record
 *   subscribe(fn)                 -> fn(state) on any change (local OR remote tab)
 *   actions.<name>(payload)       -> dispatch a role action (mutates + commits)
 *   calc.<name>()                 -> derived figures (all tie out)
 *   fmt / esc                     -> formatting helpers
 *   meta                          -> PERSONAS, STEP_LABELS, STAGE_TO_STEP, etc.
 *   stageToStep(stage)            -> rail index
 *   isCloseOriginator()           -> did THIS tab fire the current close?
 *   CLOSE_MS                      -> animation/finalize timing
 * Depends on: CT.sync
 * ------------------------------------------------------------------------- */
"use strict";
window.CT = window.CT || {};

CT.state = (function () {
  // -------------------------------------------------------------- sample data
  // NAV-per-unit is $1.00 for fund and CV, stated explicitly, so "8.00M units"
  // reads transparently as "$8.00M NAV at $1.00/unit". All settlement figures
  // DERIVE from these inputs and tie out (sum in = sum out).
  const DEALS = {
    1: {
      fund: "Meridian Growth Fund III", vintage: "2019 vintage · buyout",
      vehicle: "Meridian Continuation Vehicle I", vehicleShort: "Meridian CV I",
      asset: "Project Atlas — portfolio interest", assetShort: "Project Atlas",
      navAsOf: "31 Mar 2026", fundNav: 52.0, navPerUnit: 1.00,
      secPrice: 0.96, fairLow: 0.92, fairHigh: 0.99, fairnessProvider: "Houlihan Lokey",
      gpCommit: "2.0% of CV", electionDeadline: "12 Jul 2026",
      staying: { name: "Hawthorn Pension", type: "Public pension · QP", committed: 15.0, nav: 9.4, roll: 8.0 },
      leaving: { name: "Calder Family Office", type: "Single-family office · QP", committed: 8.0, nav: 5.0, exit: 5.0 },
      buyer: { name: "Northbeam Secondaries", aum: "$4.2B", mandate: "GP-led secondaries & continuation vehicles", kyc: "Qualified Purchaser · KYC verified", navBuy: 5.0, price: 0.96 },
    },
    2: {
      fund: "Brightwater Buyout Fund II", vintage: "2017 vintage · buyout",
      vehicle: "Brightwater Continuation Vehicle I", vehicleShort: "Brightwater CV I",
      asset: "Project Vega — portfolio interest", assetShort: "Project Vega",
      navAsOf: "31 Mar 2026", fundNav: 38.0, navPerUnit: 1.00,
      secPrice: 0.97, fairLow: 0.93, fairHigh: 0.99, fairnessProvider: "Lazard",
      gpCommit: "2.5% of CV", electionDeadline: "14 Aug 2026",
      staying: { name: "Irongate Endowment", type: "University endowment · QP", committed: 12.0, nav: 7.2, roll: 6.0 },
      leaving: { name: "Sefton Trust", type: "Private trust · QP", committed: 5.0, nav: 3.0, exit: 3.0 },
      buyer: { name: "Northbeam Secondaries", aum: "$4.2B", mandate: "GP-led secondaries & continuation vehicles", kyc: "Qualified Purchaser · KYC verified", navBuy: 3.0, price: 0.97 },
    },
  };

  const PERSONAS = {
    advisor:   { label: "Advisor / Organizer", role: "Runs the close",        short: "ADVISOR",   person: "Dana Whitfield", org: "Whitfield Advisory", initials: "DW" },
    staying:   { label: "Investor — Staying",  role: "Rolls into new fund",   short: "STAYING",   person: "Hawthorn Pension", org: "Public pension · QP", initials: "HP" },
    leaving:   { label: "Investor — Leaving",  role: "Cashes out",            short: "LEAVING",   person: "Calder Family Office", org: "Single-family office · QP", initials: "CF" },
    buyer:     { label: "Secondary Buyer",     role: "Pays cash, gets units", short: "BUYER",     person: "Northbeam Secondaries", org: "Secondaries · AUM $4.2B", initials: "NB" },
    oversight: { label: "Oversight — LPAC",    role: "Verifies fairness",     short: "OVERSIGHT", person: "LPAC / Regulator", org: "Advisory committee", initials: "LP" },
  };
  const ROLE_ORDER = ["advisor", "staying", "leaving", "buyer", "oversight"];

  const STEP_LABELS = [
    ["1", "Set up the room"],
    ["2", "Bring participants in"],
    ["3", "Price the deal"],
    ["4", "Decide: roll or sell"],
    ["5", "Work out who gets what"],
    ["6", "Approve my part"],
    ["7", "Close — all at once"],
    ["8", "Prove it was fair"],
  ];
  const STAGE_TO_STEP = { setup: 0, invite: 1, price: 2, elect: 3, compute: 4, approve: 5, close: 6, closing: 6, settled: 7 };

  const DEAL_ID = "D-001";
  const CLOSE_MS = { step: 180, settleAt: 4 * 180 + 400, failAt: 3 * 180 + 250 };

  // -------------------------------------------------------------- state core
  const numOr = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  function validState(s) { return s && typeof s === "object" && DEALS[s.dealNo] && typeof s.stage === "string"; }

  function freshState(dealNo) {
    return {
      dealNo, stage: "setup", room: null,
      elections: { staying: null, leaving: null },
      offer: null, allocation: null,
      approvals: { buyer: false, vehicle: false, staying: false, leaving: false },
      closed: false, closedAt: null, failedAttempt: false,
      oversightGranted: false, buyerVerified: dealNo > 1, closingFail: false, ts: 0,
    };
  }

  let shared = (function () { const s = CT.sync.read(); return validState(s) ? s : freshState(1); })();
  const subscribers = [];

  function commit() {
    shared.ts = Date.now();
    CT.sync.write(shared);
    emit();
  }
  function emit() { subscribers.forEach((fn) => { try { fn(shared); } catch (e) {} }); }
  function subscribe(fn) { subscribers.push(fn); }

  // inbound from another tab
  let lastStage = shared.stage;
  CT.sync.subscribe((s) => {
    if (!validState(s)) return;
    shared = s;
    emit();
  });

  // -------------------------------------------------------------- helpers / fmt
  const fmtM = (n) => `$${(Number.isFinite(+n) ? +n : 0).toFixed(2)}M`;
  const fmtUnits = (n) => `${(Number.isFinite(+n) ? +n : 0).toFixed(2)}M units`;
  const pct = (x) => { const v = (Number.isFinite(+x) ? +x : 0) * 100; return `${v.toFixed(v % 1 ? 1 : 0)}%`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function deal() { return DEALS[shared.dealNo] || DEALS[1]; }

  // -------------------------------------------------------------- derived calc
  function rollNav()  { return shared.elections.staying ? numOr(shared.elections.staying.amount, deal().staying.roll) : deal().staying.roll; }
  function exitNav()  { return shared.elections.leaving ? numOr(shared.elections.leaving.amount, deal().leaving.exit) : deal().leaving.exit; }
  function buyPrice()    { return shared.offer ? numOr(shared.offer.price, deal().buyer.price) : deal().buyer.price; }
  function buyCapacity() { return shared.offer ? numOr(shared.offer.capacity ?? shared.offer.nav, deal().buyer.navBuy) : deal().buyer.navBuy; }
  function buyNav()      { return Math.min(exitNav(), buyCapacity()); }
  function cashAmount()  { return +(buyNav() * buyPrice()).toFixed(2); }
  function buyerUnits()  { return +(buyNav() / deal().navPerUnit).toFixed(2); }
  function rollUnits()   { return +(rollNav() / deal().navPerUnit).toFixed(2); }
  function assetNav()    { return +(rollNav() + buyNav()).toFixed(2); }
  function unitsIssued() { return +(rollUnits() + buyerUnits()).toFixed(2); }
  function allApproved() { return Object.values(shared.approvals).every(Boolean); }

  const calc = { rollNav, exitNav, buyPrice, buyCapacity, buyNav, cashAmount, buyerUnits, rollUnits, assetNav, unitsIssued, allApproved };

  // allocation: pure data (no HTML). UI layers render the legs.
  function computeAllocation() {
    const d = deal();
    shared.allocation = {
      legs: [
        { n: 1, kind: "cash",  mainFig: fmtM(cashAmount()), mainSuffix: " USDC", sub: `Buyer → ${d.leaving.name} · ${fmtM(exitNav())} NAV × ${pct(buyPrice())}`, own: ["advisor", "buyer", "leaving"] },
        { n: 2, kind: "units", mainFig: fmtUnits(rollUnits()), mainSuffix: "", sub: `${d.vehicleShort} → ${d.staying.name} · ${fmtM(rollNav())} NAV rolled`, own: ["advisor", "staying"] },
        { n: 3, kind: "units", mainFig: fmtUnits(buyerUnits()), mainSuffix: "", sub: `${d.vehicleShort} → Buyer · ${fmtM(buyNav())} NAV purchased`, own: ["advisor", "buyer"] },
        { n: 4, kind: "asset", mainFig: d.assetShort, mainSuffix: ` · ${fmtM(assetNav())} NAV`, sub: `Old fund → ${d.vehicleShort} (asset transfer)`, own: ["advisor"] },
      ],
    };
  }

  function obligations() {
    const d = deal();
    return [
      { key: "buyer",   who: "Secondary Buyer",      persona: "buyer",   obl: `Escrow ${fmtM(cashAmount())} USDC for the cash leg` },
      { key: "vehicle", who: "Advisor (new vehicle)", persona: "advisor", obl: `Allocate ${fmtUnits(unitsIssued())} + ${d.assetShort} (${fmtM(assetNav())} NAV)` },
      { key: "staying", who: d.staying.name,          persona: "staying", obl: `Take delivery of ${fmtUnits(rollUnits())}` },
      { key: "leaving", who: d.leaving.name,          persona: "leaving", obl: `Take delivery of ${fmtM(cashAmount())} USDC` },
    ];
  }

  // which legs a persona may see (projection). advisor sees all; each party sees
  // only the leg(s) that bind it; oversight sees none pre-close.
  function ownLegs(persona) {
    return { advisor: [1, 2, 3, 4], buyer: [1, 3], staying: [2], leaving: [1], oversight: [] }[persona] || [];
  }

  // does this role currently hold up the close? drives "Action required".
  function actionRequiredFor(persona) {
    const s = shared;
    switch (s.stage) {
      case "setup":   return persona === "advisor";
      case "invite":  return persona === "advisor";
      case "price":   return !s.offer ? persona === "buyer" : persona === "advisor";
      case "elect":   {
        if (persona === "staying") return !s.elections.staying;
        if (persona === "leaving") return !s.elections.leaving;
        if (persona === "advisor") return !!(s.elections.staying && s.elections.leaving);
        return false;
      }
      case "compute": return persona === "advisor";
      case "approve": {
        const map = { buyer: "buyer", staying: "staying", leaving: "leaving", advisor: "vehicle" };
        if (map[persona]) {
          if (persona === "advisor") return allApproved();      // advisor's "go to close"
          return !s.approvals[map[persona]];
        }
        return false;
      }
      case "close":   return persona === "advisor";
      case "closing": return false;
      case "settled": return false;
      default:        return false;
    }
  }

  // -------------------------------------------------------------- actions
  const actions = {
    createRoom(payload) {
      const d = deal();
      shared.room = Object.assign({}, d, {
        fund: (payload && payload.fund) || d.fund,
        vehicle: (payload && payload.vehicle) || d.vehicle,
        asset: (payload && payload.asset) || d.asset,
      });
      shared.stage = "invite"; commit();
    },
    toPrice()   { shared.stage = "price"; commit(); },
    toElect()   { shared.stage = "elect"; commit(); },
    toCompute() { shared.stage = "compute"; commit(); },
    submitPrice(payload) {
      const d = deal();
      const price = Math.max(0, numOr(payload && payload.price, d.buyer.price));
      const capacity = Math.max(0, numOr(payload && payload.capacity, d.buyer.navBuy));
      shared.offer = { price, capacity }; commit();
    },
    submitElection(payload) {
      const who = payload.role;            // "staying" | "leaving"
      const me = shared.room[who];
      const choice = payload.choice || (who === "staying" ? "roll" : "exit");
      let amount = numOr(payload.amount, who === "staying" ? deal().staying.roll : deal().leaving.exit);
      amount = Math.max(0, Math.min(amount, me.nav));
      shared.elections[who] = { choice, amount }; commit();
    },
    doCompute()  { computeAllocation(); commit(); },
    toApprove()  { shared.stage = "approve"; commit(); },
    approveMine(payload) { shared.approvals[payload.key] = true; commit(); },
    toClose()    { shared.stage = "close"; commit(); },
    grantOversight() { shared.oversightGranted = true; commit(); },
    retryClose() { shared.stage = "close"; shared.failedAttempt = false; commit(); },
    startNextDeal() {
      const next = shared.dealNo + 1;
      if (!DEALS[next]) return false;
      shared = freshState(next); shared.buyerVerified = true; commit();
      return next;
    },
    reset() { shared = freshState(1); commit(); },
  };

  // -------------------------------------------------------------- atomic close
  // Only the tab that fires the close finalizes the settled/failed state; remote
  // tabs receive the "closing" broadcast and animate without finalizing.
  let originator = false;
  function fireClose(fail) {
    originator = true;
    shared.closingFail = !!fail;
    shared.stage = "closing";
    commit();

    if (fail) {
      setTimeout(() => {
        shared.stage = "settled"; shared.failedAttempt = true; shared.closed = false; shared.closingFail = false;
        commit();
      }, CLOSE_MS.failAt + 1100);
    } else {
      setTimeout(() => {
        shared.stage = "settled"; shared.failedAttempt = false; shared.closed = true; shared.closingFail = false;
        shared.closedAt = new Date().toISOString();
        commit();
      }, CLOSE_MS.settleAt);
    }
  }
  function isCloseOriginator() { return originator; }
  function clearOriginatorIfDone() { if (shared.stage !== "closing") originator = false; }

  return {
    get: () => shared,
    deal, subscribe,
    actions, fireClose, isCloseOriginator, clearOriginatorIfDone,
    calc, obligations, ownLegs, actionRequiredFor,
    fmt: { fmtM, fmtUnits, pct }, esc,
    meta: { PERSONAS, ROLE_ORDER, STEP_LABELS, STAGE_TO_STEP, DEAL_ID, CLOSE_MS },
    stageToStep: (stage) => STAGE_TO_STEP[stage] ?? 0,
  };
})();
