/* Continuum Portal — shared/state.js
 * ---------------------------------------------------------------------------
 * The deal engine. NO DOM in this file. Owns the seed datasets (2 deals, ~8 LPs,
 * 3-4 buyers), the stage machine, the sealed-bid AUCTION (multi-buyer → clearing/
 * lead price + syndicate backstop), multi-LP elections (roll/sell/split, amend,
 * default=sell, peer-private), allocation compute (pro-rata + backstop, ties out),
 * the atomic close (+ forced-failure rollback), the audit log, the flywheel, reset.
 *
 * Stages: setup → bidding → cleared → elections → allocation → approvals
 *         → settlement(transient) → settled. Buyers price FIRST via sealed bids;
 * the best qualifying bid sets the disclosed clearing price; LPs then elect.
 *
 * Interface (window.CT.state):
 *   get()                 -> shared deal state
 *   deal()                -> static DEALS[dealNo] record
 *   subscribe(fn)         -> fn(state) on any change (local OR remote tab)
 *   actions.<name>(p)     -> dispatch (mutates + commits + logs)
 *   calc.*                -> derived figures (all tie out)
 *   roster()/bidBook()/legs()/tasksFor(role) -> projected view data
 *   fmt / esc / meta      -> helpers + constants
 * Depends on: CT.sync
 * ------------------------------------------------------------------------- */
"use strict";
window.CT = window.CT || {};

CT.state = (function () {
  // ============================================================ seed datasets
  // NAV-per-unit is $1.00, stated explicitly, so "20.40M units" reads as
  // "$20.40M NAV at $1.00/unit". Every figure derives from these and ties out.
  const DEALS = {
    1: {
      id: "MRD-CV-I", fund: "Meridian Growth Fund III", vintage: "2019 vintage · buyout",
      vehicle: "Meridian Continuation Vehicle I", vehicleShort: "Meridian CV I",
      asset: "Project Atlas — portfolio interest", assetShort: "Project Atlas",
      navAsOf: "31 Mar 2026", fundNav: 52.0, navPerUnit: 1.0,
      fairLow: 0.92, fairHigh: 0.99, fairnessProvider: "Houlihan Lokey",
      gpCommit: "2.0% of CV", bidDeadline: "05 Jul 2026", electionDeadline: "12 Jul 2026",
      leadTerms: { mgmtFee: "1.5%", carry: "10% over 8% pref" },
      lps: [
        { id: "lp1", name: "Hawthorn Pension",          type: "Public pension · QP",      committed: 15.0, nav: 9.4, persona: "staying" },
        { id: "lp2", name: "Calder Family Office",       type: "Single-family office · QP", committed: 8.0,  nav: 5.0, persona: "leaving" },
        { id: "lp3", name: "Stonebridge State Retirement", type: "Public pension · QP",     committed: 14.0, nav: 8.6 },
        { id: "lp4", name: "Birchwood University Endowment", type: "Endowment · QP",        committed: 11.0, nav: 7.2 },
        { id: "lp5", name: "Meridian Fund-of-Funds",     type: "Fund-of-funds · QP",        committed: 9.0,  nav: 6.0 },
        { id: "lp6", name: "Caldwell Family Trust",      type: "Private trust · QP",        committed: 7.5,  nav: 4.8 },
        { id: "lp7", name: "Pinnacle Insurance",         type: "Insurance · QP",            committed: 10.0, nav: 6.5 },
        { id: "lp8", name: "Ashford Foundation",         type: "Foundation · QP",           committed: 7.0,  nav: 4.5 },
      ],
      buyers: [
        { id: "b1", name: "Northbeam Secondaries",          org: "Secondaries · AUM $4.2B", desk: "GP-led secondaries & continuation vehicles", persona: "buyer", defaultBid: 0.96, defaultCapacity: 16.0 },
        { id: "b2", name: "Cedar Park Pension Secondaries",  org: "Pension secondaries arm", desk: "Direct & GP-led secondaries", seeded: { price: 0.95, capacity: 10.0 } },
        { id: "b3", name: "Vantage Secondary Fund IV",       org: "Dedicated secondaries fund · $6.1B", desk: "Single-asset continuation", seeded: { price: 0.94, capacity: 12.0 } },
        { id: "b4", name: "Kestrel GP Solutions",            org: "Bank GP-solutions desk", desk: "GP-led & preferred equity", seeded: { passed: true } },
      ],
      // pre-filed background elections; hero LPs (lp1 staying, lp2 leaving) file live.
      seedElections: {
        lp3: { choice: "roll",  rollNav: 8.6, sellNav: 0.0 },
        lp4: { choice: "sell",  rollNav: 0.0, sellNav: 7.2 },
        lp5: { choice: "roll",  rollNav: 6.0, sellNav: 0.0 },
        lp6: { choice: "sell",  rollNav: 0.0, sellNav: 4.8, byDefault: true },
        lp7: { choice: "roll",  rollNav: 6.5, sellNav: 0.0 },
        lp8: { choice: "split", rollNav: 2.5, sellNav: 2.0 },
      },
      docs: [
        { name: "Limited Partnership Agreement", type: "LPA",            owner: "Whitfield Advisory", status: "Executed" },
        { name: "Fairness opinion — Houlihan Lokey", type: "Opinion",    owner: "Houlihan Lokey",     status: "On file" },
        { name: "Transaction memorandum", type: "PPM",                   owner: "Whitfield Advisory", status: "Issued" },
        { name: "LP election form", type: "Form",                        owner: "Whitfield Advisory", status: "Open" },
        { name: "Purchase & sale agreement", type: "PSA",               owner: "Whitfield Advisory", status: "Draft" },
      ],
    },
    2: {
      id: "BRW-CV-I", fund: "Brightwater Buyout Fund II", vintage: "2017 vintage · buyout",
      vehicle: "Brightwater Continuation Vehicle I", vehicleShort: "Brightwater CV I",
      asset: "Project Vega — portfolio interest", assetShort: "Project Vega",
      navAsOf: "31 Mar 2026", fundNav: 38.0, navPerUnit: 1.0,
      fairLow: 0.93, fairHigh: 0.99, fairnessProvider: "Lazard",
      gpCommit: "2.5% of CV", bidDeadline: "07 Aug 2026", electionDeadline: "14 Aug 2026",
      leadTerms: { mgmtFee: "1.25%", carry: "12.5% over 8% pref" },
      lps: [
        { id: "lp1", name: "Irongate Endowment",      type: "Endowment · QP",      committed: 12.0, nav: 7.2, persona: "staying" },
        { id: "lp2", name: "Sefton Trust",            type: "Private trust · QP",  committed: 5.0,  nav: 3.0, persona: "leaving" },
        { id: "lp3", name: "Halewood Pension",        type: "Public pension · QP", committed: 16.0, nav: 9.8 },
        { id: "lp4", name: "Marlowe Foundation",      type: "Foundation · QP",     committed: 10.0, nav: 6.0 },
        { id: "lp5", name: "Cordova Fund-of-Funds",   type: "Fund-of-funds · QP",  committed: 8.0,  nav: 5.0 },
        { id: "lp6", name: "Delmar Insurance",        type: "Insurance · QP",      committed: 11.0, nav: 7.0 },
      ],
      buyers: [
        { id: "b1", name: "Northbeam Secondaries",         org: "Secondaries · AUM $4.2B", desk: "GP-led secondaries & continuation vehicles", persona: "buyer", defaultBid: 0.97, defaultCapacity: 12.0 },
        { id: "b2", name: "Cedar Park Pension Secondaries", org: "Pension secondaries arm", desk: "Direct & GP-led secondaries", seeded: { price: 0.96, capacity: 9.0 } },
        { id: "b3", name: "Vantage Secondary Fund IV",      org: "Dedicated secondaries fund · $6.1B", desk: "Single-asset continuation", seeded: { price: 0.95, capacity: 8.0 } },
      ],
      seedElections: {
        lp3: { choice: "roll", rollNav: 9.8, sellNav: 0.0 },
        lp4: { choice: "sell", rollNav: 0.0, sellNav: 6.0 },
        lp5: { choice: "roll", rollNav: 5.0, sellNav: 0.0 },
        lp6: { choice: "sell", rollNav: 0.0, sellNav: 7.0, byDefault: true },
      },
      docs: [
        { name: "Limited Partnership Agreement", type: "LPA",         owner: "Brightwater GP",  status: "Executed" },
        { name: "Fairness opinion — Lazard", type: "Opinion",         owner: "Lazard",          status: "On file" },
        { name: "Transaction memorandum", type: "PPM",                owner: "Brightwater GP",  status: "Issued" },
        { name: "LP election form", type: "Form",                     owner: "Brightwater GP",  status: "Open" },
        { name: "Purchase & sale agreement", type: "PSA",            owner: "Brightwater GP",  status: "Draft" },
      ],
    },
  };

  // hero LP ids that a human drives live (others are background, pre-filed).
  const HERO_LP = { staying: "lp1", leaving: "lp2" };
  const LEAD_PERSONA_BUYER = "b1";

  const PERSONAS = {
    advisor:   { label: "Advisor / Organizer", role: "Runs the deal",         short: "ADVISOR",   person: "Dana Whitfield",       org: "Whitfield Advisory",        initials: "DW", entity: { kind: "advisor" } },
    staying:   { label: "Investor — Rolling",  role: "Rolls into new vehicle", short: "ROLLING",   person: "Hawthorn Pension",     org: "Public pension · QP",       initials: "HP", entity: { kind: "lp", id: "lp1" } },
    leaving:   { label: "Investor — Exiting",  role: "Sells, takes cash",      short: "EXITING",   person: "Calder Family Office", org: "Single-family office · QP", initials: "CF", entity: { kind: "lp", id: "lp2" } },
    buyer:     { label: "Secondary Buyer",     role: "Bids, buys units",       short: "BUYER",     person: "Northbeam Secondaries",org: "Secondaries · AUM $4.2B",   initials: "NB", entity: { kind: "buyer", id: "b1" } },
    oversight: { label: "Oversight — LPAC",    role: "Verifies fairness",      short: "OVERSIGHT", person: "LPAC / Regulator",     org: "Advisory committee",        initials: "LP", entity: { kind: "oversight" } },
  };
  const ROLE_ORDER = ["advisor", "staying", "leaving", "buyer", "oversight"];

  // stage machine + progress meter
  const STAGES = ["setup", "bidding", "leadSelected", "lpacConsent", "elections", "allocation", "approvals", "settlement", "settled"];
  const STAGE_META = {
    setup:        { label: "Setup",          pill: "Setup" },
    bidding:      { label: "Auction open",   pill: "Bidding" },
    leadSelected: { label: "Lead selected",  pill: "Lead set" },
    lpacConsent:  { label: "LPAC review",    pill: "Consent" },
    elections:    { label: "Elections open", pill: "Elections" },
    allocation:   { label: "Allocation",     pill: "Allocation" },
    approvals:    { label: "Approvals",      pill: "Approvals" },
    settlement:   { label: "Settling",       pill: "Settling" },
    settled:      { label: "Settled",        pill: "Settled" },
    declined:     { label: "Declined to proceed", pill: "Declined" },
  };
  const SECTIONS = ["overview", "participants", "bids", "consent", "elections", "allocation", "settlement", "documents", "audit"];
  const SECTION_LABEL = {
    overview: "Overview", participants: "Participants", bids: "Bids / Pricing",
    consent: "LPAC consent", elections: "Elections", allocation: "Allocation",
    settlement: "Settlement", documents: "Documents", audit: "Audit",
  };

  const CLOSE_MS = { step: 120, get settleAt() { return 0; } };

  // ============================================================ state core
  const numOr = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
  function validState(s) { return s && typeof s === "object" && DEALS[s.dealNo] && typeof s.stage === "string" && s.v === 6; }

  function freshState(dealNo) {
    const d = DEALS[dealNo];
    const bids = {};
    d.buyers.forEach((b) => { if (b.seeded) bids[b.id] = Object.assign({ ts: 0, seeded: true }, b.seeded); });
    const elections = {};
    Object.keys(d.seedElections || {}).forEach((k) => { elections[k] = Object.assign({ ts: 0, seeded: true }, d.seedElections[k]); });
    // flywheel: returning lead buyer keeps verified credential across deals
    const buyerVerified = {};
    d.buyers.forEach((b) => { buyerVerified[b.id] = dealNo > 1 && b.id === LEAD_PERSONA_BUYER ? true : b.id !== LEAD_PERSONA_BUYER; });
    return {
      v: 6, dealNo, stage: "setup",
      bids, bidsOpen: false,
      clearingPrice: null, leadBuyerId: null, syndicateIds: [],
      elections, electionsClosed: false,
      lpacConsent: { granted: false, recusals: [], ts: null },
      allocation: null, approvals: {},
      closed: false, closedAt: null, failedAttempt: false, closingFail: false,
      declined: false,
      oversightGranted: false, buyerVerified,
      audit: [
        ev(-6, "advisor", `Closing room opened for ${d.vehicleShort}`),
        ev(-5, "advisor", `${d.lps.length} LPs and ${d.buyers.length} buyers invited`),
        ...d.buyers.filter((b) => b.seeded && !b.seeded.passed).map((b, i) => ev(-4 + i * 0.1, b.name, "Sealed bid filed")),
        ...d.buyers.filter((b) => b.seeded && b.seeded.passed).map((b) => ev(-3, b.name, "Passed on the auction")),
        ...Object.keys(d.seedElections || {}).map((k, i) => ev(-2 + i * 0.1, d.lps.find((l) => l.id === k).name, "Election filed (sealed)")),
      ],
      ts: 0,
    };
  }
  function ev(order, actor, event) { return { order, actor, event, t: null }; }

  let shared = (function () { const s = CT.sync.read(); return validState(s) ? s : freshState(1); })();
  const subscribers = [];
  function commit() { shared.ts = Date.now(); CT.sync.write(shared); emit(); }
  function emit() { subscribers.forEach((fn) => { try { fn(shared); } catch (e) {} }); }
  function subscribe(fn) { subscribers.push(fn); }
  function log(actor, event) { shared.audit.push({ order: 100 + shared.audit.length, actor, event, t: new Date().toISOString() }); }

  CT.sync.subscribe((s) => { if (validState(s)) { shared = s; emit(); } });

  // ============================================================ helpers / fmt
  const fmtM = (n) => `$${(Number.isFinite(+n) ? +n : 0).toFixed(2)}M`;
  const fmtUnits = (n) => `${(Number.isFinite(+n) ? +n : 0).toFixed(2)}M units`;
  const pct = (x) => { const v = (Number.isFinite(+x) ? +x : 0) * 100; return `${v.toFixed(v % 1 ? 1 : 0)}%`; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function deal() { return DEALS[shared.dealNo] || DEALS[1]; }
  function lp(id) { return deal().lps.find((l) => l.id === id); }
  function buyer(id) { return deal().buyers.find((b) => b.id === id); }

  // ============================================================ derived calc
  function bidsFiled() { return deal().buyers.filter((b) => shared.bids[b.id] && !shared.bids[b.id].passed).length; }
  function bidsExpected() { return deal().buyers.length; }

  // best qualifying bid → clearing price + lead; syndicate = next bidders to
  // cover sell demand above lead capacity, joining AT the clearing price.
  function clearingCandidate() {
    const filed = deal().buyers
      .filter((b) => shared.bids[b.id] && !shared.bids[b.id].passed)
      .map((b) => ({ id: b.id, price: shared.bids[b.id].price, capacity: shared.bids[b.id].capacity }))
      .filter((b) => b.price >= deal().fairLow && b.price <= deal().fairHigh)
      .sort((a, b) => b.price - a.price || b.capacity - a.capacity);
    return filed;
  }

  function sellDemand() {
    return +deal().lps.reduce((sum, l) => {
      const e = electionFor(l.id);
      return sum + (e ? e.sellNav : (l.persona ? 0 : l.nav)); // default = sell for unfiled background; hero default handled at deadline
    }, 0).toFixed(2);
  }
  function rollDemand() {
    return +deal().lps.reduce((sum, l) => {
      const e = electionFor(l.id);
      return sum + (e ? e.rollNav : 0);
    }, 0).toFixed(2);
  }
  // election projection: filed election, or (post-deadline) default sell for unfiled
  function electionFor(id) {
    if (shared.elections[id]) return shared.elections[id];
    if (shared.electionsClosed) { const l = lp(id); return { choice: "sell", rollNav: 0, sellNav: l.nav, byDefault: true }; }
    return null;
  }
  function electionsFiledCount() { return deal().lps.filter((l) => electionFor(l.id)).length; }

  function clearingPrice() { return shared.clearingPrice; }
  function leadCapacity() { return shared.leadBuyerId ? shared.bids[shared.leadBuyerId].capacity : 0; }
  function syndicateCapacity() { return shared.syndicateIds.reduce((s, id) => s + (shared.bids[id] ? shared.bids[id].capacity : 0), 0); }
  function buyerCapacity() { return +(leadCapacity() + syndicateCapacity()).toFixed(2); }

  // filled sell NAV (capped at buyer capacity; pro-rata if oversubscribed)
  function filledSellNav() { return +Math.min(sellDemand(), buyerCapacity()).toFixed(2); }
  function fillRatio() { const s = sellDemand(); return s > 0 ? Math.min(1, buyerCapacity() / s) : 1; }
  function lpFilledSell(id) { const e = electionFor(id); return e ? +(e.sellNav * fillRatio()).toFixed(4) : 0; }
  function cashTotal() { return +(filledSellNav() * (clearingPrice() || 0)).toFixed(3); }
  function rollUnitsTotal() { return +(rollDemand() / deal().navPerUnit).toFixed(2); }
  function buyerUnitsTotal() { return +(filledSellNav() / deal().navPerUnit).toFixed(2); }
  function unitsIssued() { return +(rollUnitsTotal() + buyerUnitsTotal()).toFixed(2); }
  function assetNavIn() { return +(rollDemand() + filledSellNav()).toFixed(2); }

  // how much of filled sell each buyer funds (lead first, then syndicate pro-rata)
  function buyerFundedNav(id) {
    const need = filledSellNav();
    if (id === shared.leadBuyerId) return +Math.min(need, leadCapacity()).toFixed(3);
    if (shared.syndicateIds.includes(id)) {
      const overflow = Math.max(0, need - leadCapacity());
      const synCap = syndicateCapacity();
      return synCap > 0 ? +(overflow * (shared.bids[id].capacity / synCap)).toFixed(3) : 0;
    }
    return 0;
  }

  const calc = {
    bidsFiled, bidsExpected, sellDemand, rollDemand, clearingPrice, leadCapacity, syndicateCapacity,
    buyerCapacity, filledSellNav, fillRatio, lpFilledSell, cashTotal, rollUnitsTotal, buyerUnitsTotal,
    unitsIssued, assetNavIn, buyerFundedNav, electionFor, electionsFiledCount, oversubscribed: () => sellDemand() > buyerCapacity() + 1e-6,
  };

  // syndicate = next-best bidders (after lead, in rank order) that FILL overflow AT the
  // clearing price until lead+syndicate capacity covers sell demand. Recomputed
  // when demand changes (provisional at clearing, final at allocation).
  function recomputeSyndicate() {
    const ranked = clearingCandidate();
    if (!ranked.length || !shared.leadBuyerId) { shared.syndicateIds = []; return; }
    const need = sellDemand();
    shared.syndicateIds = [];
    let cap = shared.bids[shared.leadBuyerId].capacity;
    for (let i = 0; i < ranked.length && cap < need; i++) {
      if (ranked[i].id === shared.leadBuyerId) continue;
      shared.syndicateIds.push(ranked[i].id); cap += ranked[i].capacity;
    }
  }

  // ============================================================ allocation legs
  // Real settlement legs: a cash leg per filled selling LP, a units leg per
  // rolling LP, a units leg per funding buyer, and the asset transfer. Each leg
  // names the parties bound to it (for per-party approval + projection).
  function computeAllocation() {
    const d = deal();
    const price = clearingPrice();
    const legs = [];
    let n = 0;
    // cash legs — selling LPs receive
    d.lps.forEach((l) => {
      const sell = lpFilledSell(l.id);
      if (sell > 0.0001) {
        const cash = +(sell * price).toFixed(3);
        legs.push({ n: ++n, kind: "cash", from: "Buyer pool", to: l.name, amount: cash,
          label: `${fmtM(cash)} USDC`, sub: `Buyers → ${l.name} · ${fmtM(sell)} NAV × ${pct(price)}`,
          parties: ["advisor", { lp: l.id }, "buyers"] });
      }
    });
    // units legs — rolling LPs receive CV units
    d.lps.forEach((l) => {
      const e = electionFor(l.id);
      const roll = e ? e.rollNav : 0;
      if (roll > 0.0001) {
        legs.push({ n: ++n, kind: "units", from: d.vehicleShort, to: l.name, amount: +(roll / d.navPerUnit).toFixed(2),
          label: fmtUnits(roll / d.navPerUnit), sub: `${d.vehicleShort} → ${l.name} · ${fmtM(roll)} NAV rolled`,
          parties: ["advisor", { lp: l.id }] });
      }
    });
    // units legs — buyers receive CV units for the NAV they funded
    d.buyers.forEach((b) => {
      const funded = buyerFundedNav(b.id);
      if (funded > 0.0001) {
        legs.push({ n: ++n, kind: "units", from: d.vehicleShort, to: b.name, amount: +(funded / d.navPerUnit).toFixed(2),
          label: fmtUnits(funded / d.navPerUnit), sub: `${d.vehicleShort} → ${b.name} · ${fmtM(funded)} NAV purchased${b.id === shared.leadBuyerId ? " (lead)" : " (syndicate)"}`,
          parties: ["advisor", { buyer: b.id }] });
      }
    });
    // asset transfer
    legs.push({ n: ++n, kind: "asset", from: d.fund, to: d.vehicleShort, amount: assetNavIn(),
      label: `${d.assetShort}`, sub: `${d.fund} → ${d.vehicleShort} · ${fmtM(assetNavIn())} NAV`,
      parties: ["advisor"] });
    shared.allocation = { legs, ts: Date.now() };
  }

  // who must approve: advisor (vehicle) + lead buyer + each hero LP that has a leg.
  // background parties are pre-authorized; hero personas approve live.
  function approvalParties() {
    if (!shared.allocation) return [];
    const out = [];
    out.push({ key: "advisor", who: PERSONAS.advisor.org, role: "advisor", obl: "Issue units + transfer asset" });
    deal().buyers.forEach((b) => { if (buyerFundedNav(b.id) > 0.0001) out.push({ key: "buyer:" + b.id, who: b.name, role: "buyer", id: b.id, obl: `Escrow ${fmtM(+(buyerFundedNav(b.id) * clearingPrice()).toFixed(3))} USDC` }); });
    deal().lps.forEach((l) => {
      const e = electionFor(l.id); if (!e) return;
      const cash = +(lpFilledSell(l.id) * clearingPrice()).toFixed(3);
      const roll = e.rollNav;
      const parts = [];
      if (cash > 0.0001) parts.push(`receive ${fmtM(cash)} USDC`);
      if (roll > 0.0001) parts.push(`take ${fmtUnits(roll / deal().navPerUnit)}`);
      if (parts.length) out.push({ key: "lp:" + l.id, who: l.name, role: "lp", id: l.id, obl: parts.join(" · ") });
    });
    return out;
  }
  function seedApprovals() {
    shared.approvals = {};
    approvalParties().forEach((p) => {
      // hero personas approve live; everyone else pre-authorized
      const isHero = (p.role === "advisor") || (p.id === LEAD_PERSONA_BUYER) || (p.id === HERO_LP.staying) || (p.id === HERO_LP.leaving);
      shared.approvals[p.key] = !isHero;
    });
  }
  function allApproved() { const ks = Object.keys(shared.approvals); return ks.length > 0 && ks.every((k) => shared.approvals[k]); }
  function approvalsPending() { return Object.keys(shared.approvals).filter((k) => !shared.approvals[k]).length; }

  // map a persona → its approval key, if any
  function approvalKeyFor(role) {
    const p = PERSONAS[role]; const e = p.entity;
    if (e.kind === "advisor") return "advisor";
    if (e.kind === "buyer") return "buyer:" + e.id;
    if (e.kind === "lp") return "lp:" + e.id;
    return null;
  }

  // ============================================================ projections
  function roster() {
    return deal().lps.map((l) => {
      const e = electionFor(l.id);
      return {
        id: l.id, name: l.name, type: l.type, committed: l.committed, nav: l.nav,
        ownership: l.nav / deal().fundNav, persona: l.persona || null,
        filed: !!e, byDefault: e ? !!e.byDefault : false,
        choice: e ? e.choice : null, rollNav: e ? e.rollNav : 0, sellNav: e ? e.sellNav : 0,
      };
    });
  }
  function bidBook() {
    return deal().buyers.map((b) => {
      const bid = shared.bids[b.id];
      const passed = bid && bid.passed;
      let status = "Awaiting";
      if (passed) status = "Passed";
      else if (bid) status = shared.bidsOpen ? (b.id === shared.leadBuyerId ? "Lead" : (shared.syndicateIds.includes(b.id) ? "Syndicate" : "Outbid")) : "Bid in";
      return {
        id: b.id, name: b.name, org: b.org, desk: b.desk, persona: b.persona || null,
        verified: !!shared.buyerVerified[b.id],
        filed: !!bid && !passed, passed: !!passed,
        price: bid && !passed ? bid.price : null, capacity: bid && !passed ? bid.capacity : null,
        seeded: bid ? !!bid.seeded : false, status,
        lead: b.id === shared.leadBuyerId, syndicate: shared.syndicateIds.includes(b.id),
      };
    });
  }
  function legs() { return shared.allocation ? shared.allocation.legs : []; }

  // legs a role may see (projection): advisor all; buyer its own units leg(s);
  // LP its own cash/units legs; oversight none pre-close, all post-close.
  function legsFor(role) {
    const all = legs(); const e = PERSONAS[role].entity;
    if (e.kind === "advisor") return all;
    if (e.kind === "oversight") return shared.closed ? all : [];
    if (e.kind === "buyer") return all.filter((l) => l.parties.some((p) => p.buyer === e.id) || l.parties.includes("buyers") && l.kind === "cash" && false);
    if (e.kind === "lp") return all.filter((l) => l.parties.some((p) => p.lp === e.id));
    return [];
  }

  // task queue ("Needs you") per role
  function tasksFor(role) {
    const s = shared, t = [];
    const e = PERSONAS[role].entity;
    if (role === "advisor") {
      if (s.stage === "setup") t.push({ title: "Open the auction to buyers", section: "bids", cta: "Open auction" });
      if (s.stage === "bidding") {
        if (bidsFiled() < bidsExpected() - deal().buyers.filter((b)=>b.seeded&&b.seeded.passed).length) t.push({ title: `Awaiting bids — ${bidsFiled()} of ${bidsExpected()} in`, section: "bids", muted: true });
        t.push({ title: "Open the sealed bid book & set the clearing price", section: "bids", cta: "Open book" });
      }
      if (s.stage === "leadSelected") t.push({ title: "Send the conflict + fairness package to LPAC", section: "consent", cta: "Send to LPAC" });
      if (s.stage === "lpacConsent" && !s.lpacConsent.granted) t.push({ title: "Awaiting LPAC consent (≥10 business days)", section: "consent", muted: true });
      if (s.stage === "lpacConsent" && s.lpacConsent.granted) t.push({ title: "Open elections to LPs at the lead price", section: "elections", cta: "Open elections" });
      if (s.stage === "elections") {
        t.push({ title: `Elections — ${electionsFiledCount()} of ${deal().lps.length} filed`, section: "elections", muted: true });
        t.push({ title: "Close elections & compute the allocation", section: "allocation", cta: "Compute allocation" });
      }
      if (s.stage === "allocation") t.push({ title: "Preview the close & move to approvals", section: "allocation", cta: "Send for approval" });
      if (s.stage === "approvals") {
        const mineKey = approvalKeyFor(role);
        if (mineKey && !s.approvals[mineKey]) t.push({ title: "Authorize the vehicle's leg", section: "settlement", cta: "Authorize" });
        if (approvalsPending() > 0) t.push({ title: `Approvals — ${approvalsPending()} party leg(s) pending`, section: "settlement", muted: true });
        if (allApproved()) t.push({ title: "Settle the deal atomically", section: "settlement", cta: "Settle" });
      }
    }
    if (role === "buyer") {
      const id = e.id;
      const bid = s.bids[id];
      if ((s.stage === "bidding" || s.stage === "setup") && !bid) t.push({ title: "Submit your sealed bid", section: "bids", cta: "Submit bid" });
      if (s.stage === "approvals") { const k = approvalKeyFor(role); if (s.approvals && k in s.approvals && !s.approvals[k]) t.push({ title: "Authorize your purchase leg", section: "settlement", cta: "Authorize" }); }
    }
    if (e.kind === "lp") {
      if (s.stage === "elections" && !s.elections[e.id]) t.push({ title: "File your election — roll or sell", section: "elections", cta: "File election" });
      if (s.stage === "elections" && s.elections[e.id]) t.push({ title: "Amend your election (open until deadline)", section: "elections", muted: true });
      if (s.stage === "approvals") { const k = approvalKeyFor(role); if (s.approvals && k in s.approvals && !s.approvals[k]) t.push({ title: "Authorize your leg", section: "settlement", cta: "Authorize" }); }
    }
    if (role === "oversight") {
      if (s.stage === "lpacConsent" && !s.lpacConsent.granted) t.push({ title: "Review the conflict + fairness package & record consent", section: "consent", cta: "Review & consent" });
    }
    return t;
  }
  function needsYou(role) { return tasksFor(role).filter((t) => t.cta).length; }

  // ============================================================ actions
  const actions = {
    openAuction() { if (shared.stage === "setup") { shared.stage = "bidding"; log("advisor", "Auction opened to buyers"); commit(); } },
    submitBid(payload) {
      const id = payload.buyerId;
      const price = Math.max(0, numOr(payload.price, buyer(id).defaultBid || 0.95));
      const capacity = Math.max(0, numOr(payload.capacity, buyer(id).defaultCapacity || 10));
      shared.bids[id] = { price, capacity, ts: Date.now() };
      if (shared.stage === "setup") shared.stage = "bidding";
      log(buyer(id).name, "Sealed bid filed");
      commit();
    },
    selectLead(payload) {
      if (shared.stage !== "bidding" && shared.stage !== "setup") return;
      const ranked = clearingCandidate();
      if (!ranked.length) return;
      const id = payload && payload.buyerId;
      const lead = ranked.find((r) => r.id === id) || ranked[0];
      shared.bidsOpen = true;
      shared.leadBuyerId = lead.id;
      shared.clearingPrice = lead.price;
      recomputeSyndicate(); // provisional, on current demand; finalized at allocation
      shared.stage = "leadSelected";
      log("advisor", `Advisor selected lead — ${buyer(shared.leadBuyerId).name} · price ${pct(shared.clearingPrice)} · finalists were blind to one another`);
      if (shared.syndicateIds.length) log("advisor", `Syndicate admitted at the lead price: ${shared.syndicateIds.map((i) => buyer(i).name).join(", ")}`);
      log("advisor", `Fairness opinion on file (${deal().fairnessProvider}, ${pct(deal().fairLow)}–${pct(deal().fairHigh)}) — supports LPAC review`);
      commit();
    },
    openLpacReview() {
      if (shared.stage === "leadSelected") {
        shared.stage = "lpacConsent";
        log("advisor", "Conflict + fairness + terms package sent to LPAC · ≥10 business-day review");
        commit();
      }
    },
    recordConsent(payload) {
      if (shared.stage !== "lpacConsent") return;
      shared.lpacConsent = { granted: true, recusals: (payload && payload.recusals) || [], ts: Date.now() };
      const note = shared.lpacConsent.recusals.length ? ` · ${shared.lpacConsent.recusals.length} member(s) recused` : "";
      log("LPAC", `LPAC consented to the transaction · conflicts reviewed/waived${note}`);
      commit();
    },
    openElections() {
      if (shared.stage === "lpacConsent" && shared.lpacConsent.granted) {
        shared.stage = "elections";
        log("advisor", "Elections opened to LPs at the lead price");
        commit();
      }
    },
    submitElection(payload) {
      const id = payload.lpId; const me = lp(id);
      const choice = payload.choice; // roll | status-quo | sell | split
      let rollNav = 0, sellNav = 0, terms = "new";
      if (choice === "roll") rollNav = me.nav;
      else if (choice === "status-quo") { rollNav = me.nav; terms = "existing"; }
      else if (choice === "sell") sellNav = me.nav;
      else { rollNav = Math.max(0, Math.min(numOr(payload.rollNav, 0), me.nav)); sellNav = +(me.nav - rollNav).toFixed(2); }
      const amended = !!shared.elections[id];
      shared.elections[id] = { choice, rollNav, sellNav, terms, ts: Date.now() };
      log(me.name, amended ? "Election amended (sealed)" : "Election filed (sealed)");
      commit();
    },
    closeElectionsAndCompute() {
      if (shared.stage !== "elections") return;
      shared.electionsClosed = true;
      log("advisor", `Elections closed · default-sell applied to any unfiled LP`);
      recomputeSyndicate(); // finalize backstop against final sell demand
      computeAllocation();
      seedApprovals();
      shared.stage = "allocation";
      log("advisor", `Allocation computed · sell ${fmtM(sellDemand())} (filled ${fmtM(filledSellNav())}) · roll ${fmtM(rollDemand())}`);
      if (calc.oversubscribed()) log("advisor", "Sell demand exceeds buyer capacity · pro-rata fill applied");
      commit();
    },
    sendForApproval() { if (shared.stage === "allocation") { shared.stage = "approvals"; log("advisor", "Allocation sent to parties for per-leg approval"); commit(); } },
    approve(payload) {
      const key = payload.key;
      if (!(key in shared.approvals)) return;
      shared.approvals[key] = true;
      const who = key === "advisor" ? "Whitfield Advisory" : (key.startsWith("buyer:") ? buyer(key.slice(6)).name : lp(key.slice(3)).name);
      log(who, "Authorized its settlement leg");
      commit();
    },
    cancelApproval(payload) { const key = payload.key; if (key in shared.approvals) { shared.approvals[key] = false; log("advisor", "A leg authorization was withdrawn"); commit(); } },
    declineToProceed() {
      if (!["leadSelected", "lpacConsent", "elections", "allocation", "approvals"].includes(shared.stage)) return;
      shared.stage = "declined"; shared.declined = true;
      log("advisor", "Advisor declined to proceed (broken-deal) — pricing/terms unacceptable · nothing moved");
      commit();
    },
    grantOversight() { shared.oversightGranted = true; commit(); },
    retryClose() { shared.stage = "approvals"; shared.failedAttempt = false; shared.closingFail = false; commit(); },
    startNextDeal() {
      const next = shared.dealNo + 1; if (!DEALS[next]) return false;
      shared = freshState(next); shared.buyerVerified[LEAD_PERSONA_BUYER] = true;
      log("advisor", "Returning buyer credential reused — Northbeam pre-verified");
      commit(); return next;
    },
    reset() { shared = freshState(1); commit(); },
  };

  // ============================================================ atomic close
  let originator = false;
  function fireClose(fail) {
    if (shared.stage !== "approvals" || !allApproved()) return;
    originator = true;
    shared.closingFail = !!fail;
    shared.stage = "settlement";
    log("advisor", fail ? "Atomic settlement initiated (forced-failure test)" : "Atomic settlement initiated");
    commit();
    const span = (legs().length + 1) * CLOSE_MS.step + 400;
    if (fail) {
      setTimeout(() => {
        shared.stage = "settled"; shared.failedAttempt = true; shared.closed = false; shared.closingFail = false;
        log("advisor", "Settlement failed · every leg rolled back · nothing moved");
        commit();
      }, span + 600);
    } else {
      setTimeout(() => {
        shared.stage = "settled"; shared.failedAttempt = false; shared.closed = true; shared.closingFail = false;
        shared.closedAt = new Date().toISOString();
        log("advisor", `Deal settled atomically · ${legs().length} legs · T+0`);
        commit();
      }, span);
    }
  }
  function isCloseOriginator() { return originator; }
  function clearOriginatorIfDone() { if (shared.stage !== "settlement") originator = false; }

  return {
    get: () => shared, deal, lp, buyer, subscribe,
    actions, fireClose, isCloseOriginator, clearOriginatorIfDone,
    calc, roster, bidBook, legs, legsFor, tasksFor, needsYou, approvalParties, approvalsPending, allApproved, approvalKeyFor,
    fmt: { fmtM, fmtUnits, pct }, esc,
    meta: { PERSONAS, ROLE_ORDER, STAGES, STAGE_META, SECTIONS, SECTION_LABEL, CLOSE_MS, HERO_LP, LEAD_PERSONA_BUYER },
    stageIndex: (st) => STAGES.indexOf(st || shared.stage),
  };
})();
