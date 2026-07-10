/* Continuum — confidential closing room (UX prototype)
 * ---------------------------------------------------------------------------
 * A walking-skeleton demo of one GP-led continuation deal closing across five
 * parties. NO Canton, NO backend, NO crypto. Every ledger/settlement behavior
 * is simulated in-memory. The wow is seeing PRIVACY (sealed inputs render
 * redacted to other parties) and ATOMICITY (one close moves every leg, or a
 * forced failure moves nothing).
 *
 * Data model is built to read true to a secondaries-finance audience: each deal
 * carries a reference NAV (as-of date), fund NAV, NAV-per-unit, a secondary
 * price as % of NAV, fairness range + provider, rollover economics, deadlines,
 * and per-LP positions (committed capital, NAV, ownership %). All settlement
 * numbers DERIVE from these inputs and tie out (sum in = sum out).
 *
 * State model
 *   - Shared deal state -> localStorage + BroadcastChannel (syncs across tabs)
 *   - viewAs (which persona this tab is showing) -> sessionStorage (per tab)
 *
 * Stages: setup -> invite -> price -> elect -> compute -> approve
 *         -> close -> closing(transient) -> settled -> (flywheel resets to setup)
 * The buy side prices FIRST (publicly, fairness-validated); LPs then elect
 * roll vs sell against that set price. Privacy at election is LP-vs-LP only.
 * ------------------------------------------------------------------------- */

"use strict";

// ---------------------------------------------------------------- sample data
// NAV-per-unit is $1.00 for fund and continuation vehicle, stated explicitly,
// so "8.00M units" reads transparently as "$8.00M NAV at $1.00/unit".
const DEALS = {
  1: {
    fund:    "Meridian Growth Fund III",
    vintage: "2019 vintage · buyout",
    vehicle: "Meridian Continuation Vehicle I",
    vehicleShort: "Meridian CV I",
    asset:   "Project Atlas — portfolio interest",
    assetShort: "Project Atlas",
    navAsOf:  "31 Mar 2026",
    fundNav:  52.0,        // $M total fund NAV at reference date
    navPerUnit: 1.00,      // $ NAV per unit (fund and CV strike at the same NAV)
    secPrice: 0.96,        // secondary price as fraction of NAV
    fairLow:  0.92, fairHigh: 0.99,
    fairnessProvider: "Houlihan Lokey",
    gpCommit: "2.0% of CV",
    electionDeadline: "12 Jul 2026",
    staying: { name: "Hawthorn Pension",     type: "Public pension · QP", committed: 15.0, nav: 9.4, roll: 8.0 },
    leaving: { name: "Calder Family Office",  type: "Single-family office · QP", committed: 8.0, nav: 5.0, exit: 5.0 },
    buyer:   { name: "Northbeam Secondaries", aum: "$4.2B", mandate: "GP-led secondaries & continuation vehicles", kyc: "Qualified Purchaser · KYC verified", navBuy: 5.0, price: 0.96 },
  },
  2: {
    fund:    "Brightwater Buyout Fund II",
    vintage: "2017 vintage · buyout",
    vehicle: "Brightwater Continuation Vehicle I",
    vehicleShort: "Brightwater CV I",
    asset:   "Project Vega — portfolio interest",
    assetShort: "Project Vega",
    navAsOf:  "31 Mar 2026",
    fundNav:  38.0,
    navPerUnit: 1.00,
    secPrice: 0.97,
    fairLow:  0.93, fairHigh: 0.99,
    fairnessProvider: "Lazard",
    gpCommit: "2.5% of CV",
    electionDeadline: "14 Aug 2026",
    staying: { name: "Irongate Endowment", type: "University endowment · QP", committed: 12.0, nav: 7.2, roll: 6.0 },
    leaving: { name: "Sefton Trust",        type: "Private trust · QP", committed: 5.0, nav: 3.0, exit: 3.0 },
    buyer:   { name: "Northbeam Secondaries", aum: "$4.2B", mandate: "GP-led secondaries & continuation vehicles", kyc: "Qualified Purchaser · KYC verified", navBuy: 3.0, price: 0.97 },
  },
};

const PERSONAS = {
  advisor:   { label: "Advisor / Organizer", role: "Runs the close",        short: "ADVISOR" },
  staying:   { label: "Investor — Staying",  role: "Rolls into new fund",   short: "STAYING" },
  leaving:   { label: "Investor — Leaving",  role: "Cashes out",            short: "LEAVING" },
  buyer:     { label: "Secondary Buyer",     role: "Pays cash, gets units", short: "BUYER" },
  oversight: { label: "Oversight — LPAC",    role: "Verifies fairness",     short: "OVERSIGHT" },
};

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

// Real CV order: the buy side sets a fairness-validated price FIRST, then LPs
// elect roll vs sell against that already-fixed, publicly-disclosed price.
const STAGE_TO_STEP = {
  setup: 0, invite: 1, price: 2, elect: 3, compute: 4,
  approve: 5, close: 6, closing: 6, settled: 7,
};

// ---------------------------------------------------------------- state
const SHARED_KEY = "continuum.shared.v4";
const VIEW_KEY   = "continuum.viewAs";

// coerce to a finite number or fall back — keeps a stale/bad value from ever
// rendering as "NaN" (e.g. an older-schema offer arriving over BroadcastChannel)
const numOr = (v, d) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// accept inbound shared state only if it's structurally a deal state we recognise
function validState(s) {
  return s && typeof s === "object" && DEALS[s.dealNo] && typeof s.stage === "string";
}

function freshState(dealNo) {
  return {
    dealNo,
    stage: "setup",
    room: null,                 // snapshot of the deal once the room opens
    elections: { staying: null, leaving: null }, // {choice, amount}  (amount = $M NAV)
    offer: null,                // {price, capacity}  set BEFORE elections, public to the room
    allocation: null,           // {legs:[...]}
    approvals: { buyer: false, vehicle: false, staying: false, leaving: false },
    closed: false,
    closedAt: null,
    failedAttempt: false,
    oversightGranted: false,
    buyerVerified: dealNo > 1,  // returning buyer reuses credential in deal 2
    ts: 0,
  };
}

function loadShared() {
  try { const raw = localStorage.getItem(SHARED_KEY); if (raw) { const s = JSON.parse(raw); if (validState(s)) return s; } } catch (e) {}
  return freshState(1);
}

let shared = loadShared();
let viewAs = sessionStorage.getItem(VIEW_KEY) || "advisor";
const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("continuum") : null;

function commit() {
  shared.ts = Date.now();
  try { localStorage.setItem(SHARED_KEY, JSON.stringify(shared)); } catch (e) {}
  if (bc) bc.postMessage(shared);
  render();
}

if (bc) bc.onmessage = (e) => { if (validState(e.data)) { shared = e.data; render(); } };
window.addEventListener("storage", (e) => {
  if (e.key === SHARED_KEY && e.newValue) { try { const s = JSON.parse(e.newValue); if (validState(s)) { shared = s; render(); } } catch (err) {} }
});

// ---------------------------------------------------------------- helpers
const $ = (sel, root = document) => root.querySelector(sel);
const fmtM = (n) => `$${(Number.isFinite(+n) ? +n : 0).toFixed(2)}M`;
const fmtUnits = (n) => `${(Number.isFinite(+n) ? +n : 0).toFixed(2)}M units`;
const pct = (x) => { const v = (Number.isFinite(+x) ? +x : 0) * 100; return `${v.toFixed(v % 1 ? 1 : 0)}%`; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function deal() { return DEALS[shared.dealNo] || DEALS[1]; }
function rollNav()  { return shared.elections.staying ? numOr(shared.elections.staying.amount, deal().staying.roll) : deal().staying.roll; }
function exitNav()  { return shared.elections.leaving ? numOr(shared.elections.leaving.amount, deal().leaving.exit) : deal().leaving.exit; }
// `?? offer.units` migrates any older-schema offer that used `units` instead of `nav`
// price is set BEFORE elections; the NAV actually bought = what LPs elect to
// sell, capped at the buyer's stated capacity (R1 = one seller, so = exit).
function buyPrice()    { return shared.offer ? numOr(shared.offer.price, deal().buyer.price) : deal().buyer.price; }
function buyCapacity() { return shared.offer ? numOr(shared.offer.capacity ?? shared.offer.nav, deal().buyer.navBuy) : deal().buyer.navBuy; }
function buyNav()      { return Math.min(exitNav(), buyCapacity()); }
function cashAmount() { return +(buyNav() * buyPrice()).toFixed(2); }
function buyerUnits() { return +(buyNav() / deal().navPerUnit).toFixed(2); }
function rollUnits()  { return +(rollNav() / deal().navPerUnit).toFixed(2); }
function assetNav()   { return +(rollNav() + buyNav()).toFixed(2); }       // NAV transferred into the CV
function unitsIssued(){ return +(rollUnits() + buyerUnits()).toFixed(2); } // CV units minted at close

function reducedMotion() { return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches; }

function toast(msg, kind = "") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.className = "toast" + (kind ? " " + kind : ""); }, 3200);
}

function redactBar(w) { return `<span class="redact" style="width:${w}px"></span>`; }

// ---------------------------------------------------------------- allocation
function computeAllocation() {
  const d = deal();
  shared.allocation = {
    legs: [
      { n: 1, kind: "cash",  main: `<span class="figure">${fmtM(cashAmount())}</span> USDC`,        sub: `Buyer → ${d.leaving.name} · ${fmtM(exitNav())} NAV × ${pct(buyPrice())}` },
      { n: 2, kind: "units", main: `<span class="figure">${fmtUnits(rollUnits())}</span>`,            sub: `${d.vehicleShort} → ${d.staying.name} · ${fmtM(rollNav())} NAV rolled` },
      { n: 3, kind: "units", main: `<span class="figure">${fmtUnits(buyerUnits())}</span>`,           sub: `${d.vehicleShort} → Buyer · ${fmtM(buyNav())} NAV purchased` },
      { n: 4, kind: "asset", main: `<span class="figure">${esc(d.assetShort)}</span> · ${fmtM(assetNav())} NAV`, sub: `Old fund → ${d.vehicleShort} (asset transfer)` },
    ],
  };
}

function obligations() {
  const d = deal();
  return [
    { key: "buyer",   who: "Secondary Buyer",       persona: "buyer",   obl: `Escrow ${fmtM(cashAmount())} USDC for the cash leg` },
    { key: "vehicle", who: "Advisor (new vehicle)",  persona: "advisor", obl: `Allocate ${fmtUnits(unitsIssued())} + ${d.assetShort} (${fmtM(assetNav())} NAV)` },
    { key: "staying", who: d.staying.name,           persona: "staying", obl: `Take delivery of ${fmtUnits(rollUnits())}` },
    { key: "leaving", who: d.leaving.name,           persona: "leaving", obl: `Take delivery of ${fmtM(cashAmount())} USDC` },
  ];
}
function allApproved() { return Object.values(shared.approvals).every(Boolean); }

// ---------------------------------------------------------------- render
function render() {
  $("#deal-no").textContent = String(shared.dealNo).padStart(2, "0");
  if ($("#persona-select").value !== viewAs) $("#persona-select").value = viewAs;
  renderStepper();
  $("#main").innerHTML = view();
  wire();
}

function renderStepper() {
  const cur = STAGE_TO_STEP[shared.stage] ?? 0;
  $("#stepper").innerHTML = STEP_LABELS.map((s, i) => {
    const cls = i < cur ? "done" : (i === cur ? "active" : "");
    return `<div class="stp ${cls}"><span class="sn">${s[0]}</span><span class="sl">${esc(s[1])}</span></div>`;
  }).join("");
}

function stageHead(title, lede) {
  const p = PERSONAS[viewAs];
  return `<div class="stage-head">
    <span class="persona-tag">${esc(p.label)} <span class="role">· ${esc(p.role)}</span></span>
    <h1>${title}</h1>
    <p class="lede">${lede}</p>
  </div>`;
}

function locked(title, body) {
  return `<div class="locked"><div class="lk-icon" aria-hidden="true"></div>
    <h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
}

function twoCol(mainHtml, sideHtml) {
  return `<div class="two-col"><div>${mainHtml}</div><aside class="side-rail">${sideHtml}</aside></div>`;
}
function srCard(eyebrow, title, body, items, accent) {
  const list = items && items.length ? `<ul>${items.map((i) => `<li><span>${i}</span></li>`).join("")}</ul>` : "";
  return `<div class="sr-card ${accent ? "accent" : ""}">
    <span class="eyebrow ${accent ? "accent" : ""}">${esc(eyebrow)}</span>
    ${title ? `<h3>${esc(title)}</h3>` : ""}${body ? `<p>${body}</p>` : ""}${list}</div>`;
}

// terms summary used on setup + invite + (compact) elsewhere
function termsCard(d) {
  return `<div class="card">
    <span class="eyebrow card-eyebrow">Deal terms</span>
    <dl class="kv">
      <dt>Reference NAV</dt><dd><span class="figure">${fmtM(d.fundNav)}</span> as of ${esc(d.navAsOf)}</dd>
      <dt>Secondary price</dt><dd><span class="figure">${pct(d.secPrice)}</span> of NAV <span class="mute mono" style="font-size:12px">· range ${pct(d.fairLow)}–${pct(d.fairHigh)}</span></dd>
      <dt>Fairness opinion</dt><dd>${esc(d.fairnessProvider)}</dd>
      <dt>Election deadline</dt><dd>${esc(d.electionDeadline)}</dd>
    </dl>
  </div>`;
}

function view() {
  switch (shared.stage) {
    case "setup":   return vSetup();
    case "invite":  return vInvite();
    case "price":   return vPrice();
    case "elect":   return vElect();
    case "compute": return vCompute();
    case "approve": return vApprove();
    case "close":
    case "closing": return vClose();
    case "settled": return vSettled();
    default:        return vSetup();
  }
}

// ---- stage 1: setup ----
function vSetup() {
  const d = deal();
  const returning = shared.dealNo > 1;
  if (viewAs === "advisor") {
    return stageHead("Set up the closing room",
      `Name the fund, the new vehicle, and the asset. The reference NAV and secondary price are struck off the ${esc(d.navAsOf)} valuation. Invited parties see the shell — never each other's later private inputs.`)
      + `<div class="two-col" style="max-width:980px;grid-template-columns:1fr 1fr">
        <div class="card">
          <span class="eyebrow accent card-eyebrow">Vehicle &amp; asset</span>
          <div class="form-row"><label for="f-fund">Old fund</label><input class="input" id="f-fund" value="${esc(d.fund)}"></div>
          <div class="form-row"><label for="f-vehicle">New continuation vehicle</label><input class="input" id="f-vehicle" value="${esc(d.vehicle)}"></div>
          <div class="form-row"><label for="f-asset">Asset transferring in</label><input class="input" id="f-asset" value="${esc(d.asset)}"></div>
          <div class="actions"><button class="btn big" id="create-room">${returning ? "Clone &amp; open room" : "Open closing room"}</button></div>
          ${returning ? `<p class="mono" style="font-size:12px;color:var(--mute);margin:0">Cloned from your prior close — one click to reopen.</p>` : ""}
        </div>
        ${termsCard(d)}
      </div>`;
  }
  return stageHead("Waiting for the room to open",
    `The advisor is setting up the deal. You'll be brought in as soon as the closing room opens.`)
    + locked("Room not open yet", "The advisor names the fund, vehicle and asset and strikes the terms off the reference NAV, then invites the parties. Nothing for you to do yet.");
}

// ---- stage 2: invite ----
function vInvite() {
  const d = shared.room;
  if (viewAs === "advisor") {
    return stageHead("Bring the participants in",
      `The room is open. Invite the parties — the Buyer is verified once with a reusable eligibility credential, so they never re-onboard for future deals.`)
      + `<div class="two-col" style="max-width:980px;grid-template-columns:1fr 1fr">
        <div class="card">
          <span class="eyebrow card-eyebrow">Roster &amp; positions</span>
          <div class="approvals">
            ${rosterRow(d.staying.name, d.staying.type, `${fmtM(d.staying.committed)} committed · ${fmtM(d.staying.nav)} NAV · ${pct(d.staying.nav / d.fundNav)}`, "Joined", "ok")}
            ${rosterRow(d.leaving.name, d.leaving.type, `${fmtM(d.leaving.committed)} committed · ${fmtM(d.leaving.nav)} NAV · ${pct(d.leaving.nav / d.fundNav)}`, "Joined", "ok")}
            ${rosterRow(d.buyer.name, `Secondary buyer · AUM ${d.buyer.aum}`, esc(d.buyer.mandate), shared.buyerVerified ? "Verified ✓ reused" : "Verified ✓ once", "ok")}
            ${rosterRow("LPAC (Oversight)", "LP advisory committee", "Post-close verification window", "Observer", "sealed")}
          </div>
          <div class="actions"><button class="btn big" id="to-price">Price the deal</button></div>
        </div>
        ${termsCard(d)}
      </div>`;
  }
  if (viewAs === "buyer") {
    return stageHead("You're in the room",
      `You've joined the closing room for ${esc(d.vehicleShort)}. Your eligibility is verified once and reusable — you won't re-onboard for the next deal.`)
      + `<div class="card accent" style="max-width:580px">
        <span class="eyebrow accent card-eyebrow">Eligibility credential</span>
        <h2>${shared.buyerVerified ? "Verified investor — reused" : "Verified investor"}</h2>
        <dl class="kv">
          <dt>Holder</dt><dd>${esc(d.buyer.name)}</dd>
          <dt>AUM</dt><dd>${esc(d.buyer.aum)}</dd>
          <dt>Mandate</dt><dd>${esc(d.buyer.mandate)}</dd>
          <dt>KYC status</dt><dd>${esc(d.buyer.kyc)}</dd>
          <dt>Status</dt><dd><span class="chip ok">Active</span></dd>
        </dl>
        <p class="dim" style="font-size:13px;margin:0">Issued once by the KYC issuer; carries across advisors and deals. ${shared.buyerVerified ? "Reused from your earlier close — zero re-onboarding." : "You'll reference it when you price the deal."}</p>
      </div>`;
  }
  if (viewAs === "staying" || viewAs === "leaving") {
    const me = d[viewAs];
    return stageHead("You're in the room",
      `You've joined the closing room for ${esc(d.vehicleShort)}. Here's your position in ${esc(d.fund)} — the advisor will open elections shortly.`)
      + `<div class="card" style="max-width:580px">
        <span class="eyebrow card-eyebrow">Your position in the fund</span>
        ${positionPanelBody(me, d)}
      </div>`;
  }
  return stageHead("A deal is underway",
    `A continuation deal for ${esc(d.fund)} has opened. Per the rules, your verification window opens only after the close.`)
    + locked("Sealed until close", "Before close you see only that a deal exists — never the live private inputs.");
}

function rosterRow(name, role, detail, chip, cls) {
  return `<div class="appr"><div class="who">${esc(name)}<div class="obl">${esc(role)} · ${detail}</div></div><span class="chip ${cls}">${chip}</span></div>`;
}

function positionPanelBody(me, d) {
  return `<dl class="kv">
    <dt>Committed capital</dt><dd><span class="figure">${fmtM(me.committed)}</span></dd>
    <dt>Current NAV</dt><dd><span class="figure">${fmtM(me.nav)}</span> as of ${esc(d.navAsOf)}</dd>
    <dt>Units held</dt><dd><span class="figure">${fmtUnits(me.nav / d.navPerUnit)}</span> at $${d.navPerUnit.toFixed(2)}/unit</dd>
    <dt>Ownership</dt><dd><span class="figure">${pct(me.nav / d.fundNav)}</span> of ${fmtM(d.fundNav)} fund NAV</dd>
  </dl>`;
}

// ---- stage 4: decide roll or sell (elections AT the public, set price) ----
function vElect() {
  const d = shared.room;
  const el = shared.elections;
  if (viewAs === "staying" || viewAs === "leaving") {
    const me = d[viewAs];
    const mine = el[viewAs];
    const isRoll = viewAs === "staying";
    const def = isRoll ? d.staying.roll : d.leaving.exit;
    const otherKey = isRoll ? "leaving" : "staying";

    if (mine) {
      return stageHead("Your election is in — private from other LPs",
        `Submitted privately. No other LP can see your roll-or-sell choice; the advisor sees only that you've decided. Binding at the ${esc(d.electionDeadline)} deadline.`)
        + `<div class="card accent" style="max-width:580px">
          <span class="eyebrow accent card-eyebrow">Your private election</span>
          <dl class="kv">
            <dt>Decision</dt><dd>${mine.choice === "roll" ? "Roll into " + esc(d.vehicleShort) : "Sell at " + pct(buyPrice()) + " of NAV"}</dd>
            <dt>Amount</dt><dd><span class="figure">${fmtM(mine.amount)}</span> NAV${mine.choice === "roll" ? "" : ` · ${fmtM(+(mine.amount * buyPrice()).toFixed(2))} USDC`}</dd>
            <dt>Of your position</dt><dd>${fmtM(me.nav)} NAV · ${pct(mine.amount / me.nav)} elected</dd>
          </dl>
          <span class="chip ok">Submitted privately</span>
        </div>`
        + sealedPeek(otherKey);
    }

    return stageHead("Decide: roll or sell",
      `The price is set at <strong>${pct(buyPrice())} of NAV</strong> (fairness-validated by ${esc(d.fairnessProvider)}). Choose privately whether to roll into ${esc(d.vehicleShort)} or sell at that price — and for how much of your ${fmtM(me.nav)} NAV. <strong>No other LP sees your choice.</strong>`)
      + twoCol(`<div class="card">
        <span class="eyebrow accent card-eyebrow">Your election — private from other LPs</span>
        <div class="choice-row" id="choice-row">
          <button class="choice" data-choice="roll" aria-pressed="${isRoll}"><span class="ct">Roll over</span><span class="cd">Stay in — receive ${esc(d.vehicleShort)} units</span></button>
          <button class="choice" data-choice="exit" aria-pressed="${!isRoll}"><span class="ct">Sell</span><span class="cd">Take ${pct(buyPrice())} of NAV — receive USDC</span></button>
        </div>
        <div class="form-row"><label for="el-amt">Amount to ${isRoll ? "roll" : "sell"} — of ${fmtM(me.nav)} NAV (max)</label>
          <div class="input-group"><span class="prefix">$</span><input class="input num" id="el-amt" type="number" min="0" max="${me.nav}" step="0.1" value="${def.toFixed(1)}"><span class="suffix">M NAV</span></div>
        </div>
        <p class="mono" style="font-size:12px;color:var(--mute);margin:0">Capped at your ${fmtM(me.nav)} NAV. Default if you do nothing is SELL — you're never forced to roll.</p>
        <div class="actions"><button class="btn big" id="submit-election">Submit my election privately</button></div>
      </div>`,
      `<div class="sr-card"><span class="eyebrow">The set price</span><h3>${pct(buyPrice())} of NAV</h3><p>Public to the room · ${esc(d.fairnessProvider)} fairness opinion on file.</p></div>`
      + `<div class="sr-card"><span class="eyebrow">Your position</span>${positionPanelBody(me, d)}</div>`
      + srCard("Peer privacy", "Private from other LPs", "Your roll-or-sell choice is visible only to you. Other LPs can't see it; the advisor sees only that you've decided.", ["No other LP sees your election", "Organizer sees a signal, not contents", "Binding at the deadline"], true));
  }

  if (viewAs === "advisor") {
    const inCount = (el.staying ? 1 : 0) + (el.leaving ? 1 : 0);
    return stageHead("Tracking elections — contents sealed",
      `Each LP decides roll vs sell at the public ${pct(buyPrice())} price. You see <strong>that</strong> an LP has decided, never <strong>what</strong> they chose — and no LP sees another's choice.`)
      + `<div class="card" style="max-width:640px">
        <span class="eyebrow card-eyebrow">Election readiness · deadline ${esc(d.electionDeadline)}</span>
        <div class="approvals">
          ${electionRow(d.staying.name, `${fmtM(d.staying.nav)} NAV position`, el.staying)}
          ${electionRow(d.leaving.name, `${fmtM(d.leaving.nav)} NAV position`, el.leaving)}
        </div>
        <p class="mono" style="font-size:12px;color:var(--mute);margin:0">${inCount}/2 in. You see a non-revealing signal — never the roll/sell choice or the amount.</p>
        <div class="actions"><button class="btn big" id="to-compute" ${inCount === 2 ? "" : "disabled"}>Work out who gets what</button></div>
      </div>`;
  }
  if (viewAs === "buyer") {
    return stageHead("LPs are deciding at your price",
      `Your price is set and public. LPs are now privately choosing roll vs sell against it. You'll absorb the sell elections up to your stated capacity.`)
      + locked("Waiting on LP elections", "Each LP's roll-or-sell choice is private from other LPs. You'll receive the units for whatever they sell.");
  }
  return stageHead("A deal is underway",
    `Elections are in progress at the public price. Oversight has no window into live private inputs — only that a deal exists.`)
    + locked("Sealed until close", "Per the rules, the LPAC oversight window opens only after the close, scoped to verify fairness.");
}

function electionRow(name, detail, val) {
  const chip = val ? `<span class="chip ok">Election in</span>` : `<span class="chip pending">Awaiting</span>`;
  return `<div class="appr"><div class="who">${esc(name)}<div class="obl">${esc(detail)}</div></div>${chip}</div>`;
}

function sealedPeek(otherKey) {
  const other = shared.room[otherKey].name;
  const has = !!shared.elections[otherKey];
  return `<div class="card" style="max-width:580px;margin-top:1px">
    <span class="eyebrow card-eyebrow">${esc(other)} — other investor</span>
    <div class="sealed-row">
      <span class="lbl">Their election</span>
      ${has ? redactBar(120) : `<span class="mono" style="font-size:13px;color:var(--mute)">not submitted yet</span>`}
      <span class="seal-note">${has ? "•••• sealed" : "pending"}</span>
    </div>
    <span class="cant-see">You can't see this — and they can't see yours.</span>
  </div>`;
}

// ---- stage 3: price the deal (buy side sets a public, fairness-validated price) ----
function priceCard(d, accent) {
  return `<div class="card ${accent ? "accent" : ""}" style="max-width:600px">
    <span class="eyebrow ${accent ? "accent" : ""} card-eyebrow">The deal price · public to the room</span>
    <dl class="kv">
      <dt>Secondary price</dt><dd><span class="figure">${pct(buyPrice())}</span> of NAV</dd>
      <dt>Per $1.00 NAV</dt><dd><span class="figure">$${buyPrice().toFixed(2)}</span> USDC to a seller</dd>
      <dt>Fairness opinion</dt><dd>${esc(d.fairnessProvider)} <span class="mute mono" style="font-size:12px">· validates ${pct(buyPrice())} within ${pct(d.fairLow)}–${pct(d.fairHigh)}</span></dd>
      <dt>Lead buyer</dt><dd>${esc(d.buyer.name)} · absorbs up to <span class="figure">${fmtM(buyCapacity())}</span> NAV</dd>
    </dl>
    <span class="chip ok">Fairness-validated · disclosed to all parties</span>
  </div>`;
}

function vPrice() {
  const d = shared.room;
  const priced = !!shared.offer;

  if (viewAs === "buyer") {
    const returning = shared.buyerVerified && shared.dealNo > 1;
    if (priced) {
      return stageHead("Your price is set — and public to the room",
        `Committed against your reusable eligibility and validated by an independent ${esc(d.fairnessProvider)} fairness opinion. Selling LPs see this price and decide roll vs sell against it.`)
        + priceCard(d, true);
    }
    return stageHead("Price the deal",
      `Commit a price as a % of NAV for the exiting interest, and how much you'll absorb. ${returning ? "Your eligibility is already verified — price in one click." : "Referenced against your verified eligibility."} An independent ${esc(d.fairnessProvider)} fairness opinion validates it, then it's <strong>disclosed to the room</strong>.`)
      + twoCol(`<div class="card">
        <span class="eyebrow accent card-eyebrow">Set the price — negotiated lead</span>
        <div class="form-row"><label for="of-price">Price — % of NAV (fairness range ${pct(d.fairLow)}–${pct(d.fairHigh)})</label>
          <div class="input-group"><input class="input num" id="of-price" type="number" min="0" max="1.2" step="0.01" value="${deal().buyer.price.toFixed(2)}"><span class="suffix">× NAV</span></div>
        </div>
        <div class="form-row"><label for="of-capacity">Capacity — NAV you'll absorb</label>
          <div class="input-group"><span class="prefix">$</span><input class="input num" id="of-capacity" type="number" min="0" step="0.1" value="${deal().buyer.navBuy.toFixed(1)}"><span class="suffix">M NAV</span></div>
        </div>
        ${returning ? `<div class="callout"><div class="ct">Returning buyer</div><p>Eligibility reused — no re-onboarding. Set your price in one click.</p></div>` : ""}
        <div class="actions"><button class="btn big" id="submit-price">${returning ? "Reuse &amp; price — one click" : "Set price &amp; disclose to room"}</button></div>
      </div>`,
      srCard("Public, negotiated price", "R1 — single lead buyer", "You set one price for the exiting interest; a fairness opinion validates it; LPs then accept or decline it. Not a live auction.", ["Price is public to all parties", `Fairness opinion by ${d.fairnessProvider}`, "If sell-demand exceeds capacity, the lead/syndicate backstops · pro-rata"], true));
  }

  if (viewAs === "advisor") {
    if (!priced) {
      return stageHead("Price the deal",
        `The lead buyer commits a price as a % of NAV, validated by an independent fairness opinion. Once set, the price is disclosed to the room so LPs can decide roll vs sell against it.`)
        + `<div class="card" style="max-width:640px">
          <span class="eyebrow card-eyebrow">Price readiness</span>
          <div class="approvals">
            <div class="appr"><div class="who">${esc(d.buyer.name)}<div class="obl">Lead buyer · AUM ${esc(d.buyer.aum)}</div></div><span class="chip pending">Pricing</span></div>
          </div>
          <p class="mono" style="font-size:12px;color:var(--mute);margin:0">Waiting for the lead buyer to set the price.</p>
        </div>`;
    }
    return stageHead("Price set &amp; fairness-validated",
      `${pct(buyPrice())} of NAV — within the ${pct(d.fairLow)}–${pct(d.fairHigh)} range, ${esc(d.fairnessProvider)} opinion on file. The price is public to the room. Open elections so LPs can decide roll vs sell at this price.`)
      + priceCard(d, false)
      + `<div class="actions" style="margin-top:24px"><button class="btn big" id="to-elect">Open elections</button></div>`;
  }

  if (viewAs === "staying" || viewAs === "leaving") {
    const me = d[viewAs];
    if (!priced) {
      return stageHead("Waiting for the deal price",
        `The lead buyer is setting the secondary price, validated by an independent fairness opinion. You'll decide roll vs sell against it next.`)
        + `<div class="card" style="max-width:580px"><span class="eyebrow card-eyebrow">Your position in the fund</span>${positionPanelBody(me, d)}</div>`;
    }
    return stageHead("The deal price is set",
      `The secondary buyer will pay <strong>${pct(buyPrice())} of NAV</strong>, validated by ${esc(d.fairnessProvider)}. You'll decide roll vs sell against this price next — your choice stays private from other LPs.`)
      + priceCard(d, false)
      + `<div class="card" style="max-width:600px;margin-top:1px"><span class="eyebrow card-eyebrow">Your position in the fund</span>${positionPanelBody(me, d)}</div>`;
  }

  return stageHead("A deal is underway",
    `A continuation deal is being priced. The oversight window opens only after the close.`)
    + locked("Sealed until close", "Per the rules, you'll get a scoped post-close verification view — never the live inputs.");
}

// ---- stage 5: compute ----
function vCompute() {
  if (viewAs === "advisor") {
    if (!shared.allocation) {
      return stageHead("Work out who gets what",
        `Size the closing allocation from the LP elections at the <strong>set ${pct(buyPrice())} price</strong>. The engine resolves the book into concrete transfer legs for you to execute — each derived from the elections, the public price, and the reference NAV.`)
        + twoCol(`<div class="card">
          <span class="eyebrow accent card-eyebrow">Compute close</span>
          <p class="dim" style="margin:0">Reads the sell and roll elections, applies the already-set secondary price and rollover NAV, then assembles the transfer legs and who must authorize each.</p>
          <div class="actions"><button class="btn big" id="do-compute">Compute the allocation</button></div>
        </div>`,
          srCard("Inputs", "What feeds the math", null, [`Sell election: ${fmtM(exitNav())} NAV`, `Roll election: ${fmtM(rollNav())} NAV`, `Set price: ${pct(buyPrice())} of NAV`, `Rollover NAV: $${deal().navPerUnit.toFixed(2)}/unit`], false));
    }
    return stageHead("The close resolves into four legs",
      `Computed from the sealed inputs — each leg is derived, not invented. The numbers tie out. Next, each party approves only its own leg.`)
      + arithmeticBlock()
      + `<div style="margin-top:20px">${legsBlock("computed")}</div>`
      + tieOutLine()
      + `<div class="actions" style="margin-top:24px"><button class="btn big" id="to-approve">Send for approvals</button></div>`;
  }
  return stageHead("Advisor is computing the close",
    `The engine is resolving the sealed inputs into transfer legs. You'll be asked to approve only your own part.`)
    + locked("Computing the allocation", "Each party sees and signs only its own obligation — never the whole book.");
}

function arithmeticBlock() {
  const d = deal();
  const rows = [
    [`Exiting · ${esc(d.leaving.name)}`, `${fmtM(exitNav())} NAV × ${pct(buyPrice())} price`, `${fmtM(cashAmount())} USDC`],
    [`Buyer units`, `${fmtM(buyNav())} NAV ÷ $${d.navPerUnit.toFixed(2)} rollover NAV`, `${fmtUnits(buyerUnits())}`],
    [`Rolling · ${esc(d.staying.name)}`, `${fmtM(rollNav())} NAV ÷ $${d.navPerUnit.toFixed(2)} rollover NAV`, `${fmtUnits(rollUnits())}`],
    [`Asset into ${esc(d.vehicleShort)}`, `${fmtM(rollNav())} + ${fmtM(buyNav())} NAV`, `${fmtM(assetNav())}`],
  ];
  return `<div class="card"><span class="eyebrow card-eyebrow">Allocation arithmetic</span>
    <table class="calc"><tbody>
      ${rows.map((r) => `<tr><td class="c-lab">${r[0]}</td><td class="c-mid mono">${r[1]}</td><td class="c-out mono">= ${r[2]}</td></tr>`).join("")}
    </tbody></table>
  </div>`;
}

function tieOutLine() {
  return `<div class="callout" style="margin-top:1px"><div class="ct">Tie-out · sum in = sum out</div>
    <p>Units issued <span class="mono">${fmtUnits(unitsIssued())}</span> = asset NAV transferred in <span class="mono">${fmtM(assetNav())}</span>. Cash leg balances: buyer <span class="mono">−${fmtM(cashAmount())}</span> = ${esc(deal().leaving.name)} <span class="mono">+${fmtM(cashAmount())}</span>.</p></div>`;
}

// which legs a persona may see (projection). advisor = executor sees all; each
// party sees only the leg(s) that bind it. oversight sees none pre-close.
function ownLegs(persona) {
  return { advisor: [1, 2, 3, 4], buyer: [1, 3], staying: [2], leaving: [1], oversight: [] }[persona] || [];
}

function legsBlock(state, only) {
  const legs = shared.allocation.legs.filter((l) => !only || only.includes(l.n));
  const cls = state === "settled" ? "settled" : state === "reverted" ? "reverted" : "";
  const label = state === "settled" ? "Settled" : state === "reverted" ? "Reverted" : "Pending";
  return `<div class="legs">${legs.map((l) => `
    <div class="leg ${cls}" data-leg="${l.n}">
      <span class="sweep" aria-hidden="true"></span>
      <span class="ln">${l.n}</span>
      <span class="desc"><span class="d-main">${l.main}</span><span class="d-sub">${esc(l.sub)}</span></span>
      <span class="st">${label}</span>
    </div>`).join("")}</div>`;
}

// ---- stage 6: approve ----
function vApprove() {
  const obls = obligations();
  const mine = obls.find((o) => o.persona === viewAs);
  const head = stageHead("Approve my part",
    `Each party authorizes only its own obligation. No one signs for the whole book. When every leg is approved, the advisor can fire the close.`);

  let actionCard = "";
  if (mine) {
    const approved = shared.approvals[mine.key];
    actionCard = `<div class="card ${approved ? "accent" : ""}" style="max-width:580px;margin-bottom:24px">
      <span class="eyebrow ${approved ? "accent" : ""} card-eyebrow">Your obligation</span>
      <h2>${mine.obl}</h2>
      ${approved ? `<span class="chip ok">Approved &amp; escrowed</span>`
        : `<div class="actions"><button class="btn big" id="approve-mine" data-key="${mine.key}">Approve my part</button></div>`}
    </div>`;
  } else if (viewAs === "oversight") {
    return head + locked("Sealed until close", "The oversight window opens only after settlement, scoped to verify fairness.");
  }

  const list = `<div class="card"><span class="eyebrow card-eyebrow">Authorization status</span>
    <div class="approvals">
      ${obls.map((o) => `<div class="appr ${o.persona === viewAs ? "mine" : ""}">
        <div class="who">${esc(o.who)}<div class="obl">${o.obl}</div></div>
        ${shared.approvals[o.key] ? `<span class="chip ok">Approved</span>` : `<span class="chip pending">Awaiting</span>`}
      </div>`).join("")}
    </div>
    ${viewAs === "advisor" && allApproved()
      ? `<div class="actions"><button class="btn big" id="to-close">All legs authorized — go to close</button></div>`
      : `<p class="mono" style="font-size:12px;color:var(--mute);margin:0">${Object.values(shared.approvals).filter(Boolean).length}/4 approved.</p>`}
  </div>`;

  return head + actionCard + list;
}

// ---- stage 7: close ----
function vClose() {
  const closing = shared.stage === "closing";
  const d = shared.room;
  if (viewAs === "advisor") {
    return stageHead("Close — all at once",
      `One action settles every leg together: <strong>${fmtM(cashAmount())} USDC</strong> to ${esc(d.leaving.name)}, <strong>${fmtUnits(unitsIssued())}</strong> to the staying investor and buyer, the asset into ${esc(d.vehicleShort)}. <strong>All-or-nothing</strong> — if any leg fails, nothing moves.`)
      + legsBlock("computed")
      + `<div class="card" style="margin-top:24px">
          <div class="actions" style="justify-content:space-between">
            <button class="btn big" id="fire-close" ${closing ? "disabled" : ""}>${closing ? "Settling…" : "CLOSE — ALL AT ONCE"}</button>
            <label class="fail-toggle"><input type="checkbox" id="fail-toggle"> Simulate a failed leg</label>
          </div>
          <p class="mono" style="font-size:12px;color:var(--mute);margin:0">Settles T+0 atomic. With the failure toggle on, one leg fails mid-settle and the whole close rolls back — no leg moves.</p>
        </div>`;
  }
  // Oversight has no window until after the close — never sees the priced book early.
  if (viewAs === "oversight") {
    return stageHead(closing ? "Settling…" : "Ready to close",
      `A continuation deal is settling. Per the rules, your scoped verification window opens only after the close — never the live private inputs.`)
      + locked("Window opens after close", "You see only that a deal exists. Your scoped verification window opens once settlement completes — need-to-know, after the fact.");
  }
  // Each party sees ONLY its own leg(s) — projection, so the privacy promise holds.
  const legs = ownLegs(viewAs);
  return stageHead(closing ? "Settling…" : "Ready to close",
    `The advisor fires a single settlement. Your pane updates the moment it lands — you see only your own ${legs.length > 1 ? "legs" : "leg"} within the atomic close.`)
    + legsBlock("computed", legs);
}

// ---- stage 8: settled ----
function vSettled() {
  if (shared.failedAttempt) {
    const legs = viewAs === "advisor" ? null : ownLegs(viewAs);
    const legsHtml = (viewAs === "oversight") ? "" : `<div style="margin-top:20px">${legsBlock("reverted", legs)}</div>`;
    return stageHead("Close reverted — nothing moved",
      `A leg failed, so the whole transaction rolled back. No cash moved, no units issued, no asset transferred. Every party is exactly where it started.`)
      + `<div class="callout fail"><div class="ct">Atomic — all or nothing</div><p>One failed leg unwinds the entire close. There is no partial settlement to clean up.</p></div>`
      + legsHtml
      + `<div class="actions" style="margin-top:24px">${viewAs === "advisor" ? `<button class="btn big" id="retry-close">Back to close — try again</button>` : `<span class="mono dim" style="font-size:13px">Waiting for the advisor to retry.</span>`}</div>`;
  }

  if (viewAs === "oversight") return vRegulator();

  const d = shared.room;
  const head = stageHead("Closed — all at once",
    `One settlement moved every leg simultaneously — T+0 atomic. No LP saw another LP's roll-or-sell choice, the close was all-or-nothing, and the cash settled in USDC.`);

  const stmt = beforeAfterStatement(d);
  const positionsCard = `<div class="card"><span class="eyebrow accent card-eyebrow">Settled ledger — one atomic transaction</span>${positionsBlock(d)}${closedStamp(d)}</div>`;

  let flywheel = "";
  if (viewAs === "advisor") {
    flywheel = `<div class="card accent" style="margin-top:24px">
      <span class="eyebrow accent card-eyebrow">Flywheel</span>
      <h2>Start the next deal</h2>
      <p class="dim" style="margin:0">The returning buyer reuses their verification and prices the next deal in one click — no re-onboarding. That's the network effect.</p>
      <div class="actions"><button class="btn big" id="start-deal2">Start deal #${String(shared.dealNo + 1).padStart(2, "0")}</button>
      ${shared.oversightGranted ? `<span class="chip ok">Oversight window granted</span>` : `<button class="btn ghost" id="grant-oversight">Grant oversight window</button>`}</div>
    </div>`;
  }

  return head + stmt + positionsCard + flywheel;
}

// per-party before -> after position statement for the active persona
function beforeAfterStatement(d) {
  const cash = cashAmount();
  let title, before, after, note;
  if (viewAs === "leaving") {
    title = "You cashed out";
    before = `${fmtUnits(d.leaving.nav / d.navPerUnit)} · ${fmtM(d.leaving.nav)} NAV in ${esc(d.fund)}`;
    after  = `${fmtM(cash)} USDC · 0 fund units`;
    note   = `Realized ${pct(buyPrice())} of NAV on ${fmtM(exitNav())}.`;
  } else if (viewAs === "staying") {
    title = "You rolled over";
    before = `${fmtUnits(d.staying.nav / d.navPerUnit)} · ${fmtM(d.staying.nav)} NAV in ${esc(d.fund)}`;
    after  = `${fmtUnits(rollUnits())} · ${fmtM(rollNav())} NAV in ${esc(d.vehicleShort)}`;
    note   = `Rolled ${fmtM(rollNav())} of your ${fmtM(d.staying.nav)} NAV at $${d.navPerUnit.toFixed(2)} NAV/unit.`;
  } else if (viewAs === "buyer") {
    title = "Your purchase settled";
    before = `${fmtM(cash)} USDC available · eligibility verified`;
    after  = `${fmtUnits(buyerUnits())} · ${fmtM(buyNav())} NAV in ${esc(d.vehicleShort)} · −${fmtM(cash)} USDC`;
    note   = `Paid ${pct(buyPrice())} of NAV. Eligibility stays verified for the next deal.`;
  } else { // advisor / vehicle
    title = "The vehicle is funded";
    before = `— (vehicle empty pre-close)`;
    after  = `Holds ${esc(d.assetShort)} (${fmtM(assetNav())} NAV) · issued ${fmtUnits(unitsIssued())}`;
    note   = `Every leg closed together. No party saw another's sealed input.`;
  }
  return `<div class="card accent" style="margin-bottom:24px">
    <span class="eyebrow accent card-eyebrow">Your position · before → after</span>
    <h2>${esc(title)}</h2>
    <div class="ba">
      <div class="ba-col"><span class="ba-lab">Before</span><span class="ba-val before">${before}</span></div>
      <div class="ba-arrow" aria-hidden="true">→</div>
      <div class="ba-col"><span class="ba-lab">After</span><span class="ba-val after">${after}</span></div>
    </div>
    <p class="dim" style="font-size:13px;margin:0">${note}</p>
  </div>`;
}

function positionsBlock(d) {
  const cash = cashAmount();
  return `<div class="positions">
    <div class="pos"><span class="who">${esc(d.leaving.name)} · leaving</span><span class="delta gain">+ ${fmtM(cash)} USDC</span><span class="note">${fmtM(exitNav())} NAV → cash at ${pct(buyPrice())}</span></div>
    <div class="pos"><span class="who">${esc(d.staying.name)} · staying</span><span class="delta gain">+ ${fmtUnits(rollUnits())}</span><span class="note">${fmtM(rollNav())} NAV rolled</span></div>
    <div class="pos"><span class="who">${esc(d.buyer.name)} · buyer</span><span class="delta move">− ${fmtM(cash)} USDC · + ${fmtUnits(buyerUnits())}</span><span class="note">paid ${pct(buyPrice())} of NAV</span></div>
    <div class="pos"><span class="who">${esc(d.vehicleShort)}</span><span class="delta move">+ ${esc(d.assetShort)} · ${fmtM(assetNav())}</span><span class="note">issued ${fmtUnits(unitsIssued())}</span></div>
  </div>`;
}

function closedStamp(d) {
  const t = shared.closedAt ? new Date(shared.closedAt) : null;
  const when = t ? t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
  return `<p class="mono" style="font-size:12px;color:var(--mute);margin:0">Settled T+0 atomic · closed ${esc(when)}</p>`;
}

function vRegulator() {
  const d = shared.room;
  if (!shared.oversightGranted) {
    return stageHead("Awaiting the oversight window",
      `The deal has closed. Per the rules, your scoped verification view opens once the advisor grants the post-close window — need-to-know, after the fact.`)
      + locked("Window not yet open", "Before close you saw only that a deal existed. The advisor now grants a scoped, post-close view.");
  }
  const cash = cashAmount();
  return stageHead("Verify the close was fair",
    `A scoped, post-close window for the LPAC. You can confirm the rules were followed — without ever having seen the live private inputs.`)
    + `<div class="card"><span class="eyebrow accent card-eyebrow">Fairness attestations</span>
      <ul class="attest">
        <li><span class="ck" aria-hidden="true"></span><div>Price set before elections &amp; within the fairness range<small>${pct(buyPrice())} of NAV · range ${pct(d.fairLow)}–${pct(d.fairHigh)} · ${esc(d.fairnessProvider)} fairness opinion on file, disclosed to all LPs</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>GP conflict disclosed<small>GP rolls a ${esc(d.gpCommit)} commitment into ${esc(d.vehicleShort)}; conflict disclosed to the LPAC</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>LPAC consent obtained<small>Advisory committee approved the terms ahead of the ${esc(d.electionDeadline)} deadline</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Settled in one atomic transaction<small>4 of 4 legs · T+0 · no partial settlement possible</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Each LP's election stayed private from other LPs<small>No LP saw another LP's roll-or-sell choice until close</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Cash settled in a USD stablecoin<small>${fmtM(cash)} USDC — not a volatile coin</small></div></li>
      </ul>
    </div>
    <div class="card" style="margin-top:1px"><span class="eyebrow card-eyebrow">Settled ledger — scoped view</span>${positionsBlock(d)}${closedStamp(d)}</div>`;
}

// ---------------------------------------------------------------- interactions
function wire() {
  const m = $("#main");
  const d = deal();

  on("create-room", () => {
    shared.room = Object.assign({}, d, {
      fund: val("f-fund", d.fund), vehicle: val("f-vehicle", d.vehicle), asset: val("f-asset", d.asset),
    });
    shared.stage = "invite";
    commit(); toast("Closing room opened.");
  });

  on("to-price", () => { shared.stage = "price"; commit(); toast("Pricing is open — lead buyer sets the price."); });
  on("to-elect", () => { shared.stage = "elect"; commit(); toast("Elections are open at the set price."); });
  on("to-compute", () => { shared.stage = "compute"; commit(); });

  m.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
    m.querySelectorAll(".choice").forEach((x) => x.setAttribute("aria-pressed", "false"));
    b.setAttribute("aria-pressed", "true");
  }));

  on("submit-election", () => {
    const me = shared.room[viewAs];
    const choice = m.querySelector('.choice[aria-pressed="true"]')?.dataset.choice || (viewAs === "staying" ? "roll" : "exit");
    let amount = numVal("el-amt", viewAs === "staying" ? d.staying.roll : d.leaving.exit);
    amount = Math.max(0, Math.min(amount, me.nav)); // cap at the position NAV
    shared.elections[viewAs] = { choice, amount };
    commit(); toast(`Election submitted privately — ${fmtM(amount)} NAV.`);
  });

  // buy side sets a public, fairness-validated price + capacity (before elections)
  on("submit-price", () => {
    const price = Math.max(0, numVal("of-price", d.buyer.price));
    const capacity = Math.max(0, numVal("of-capacity", d.buyer.navBuy));
    shared.offer = { price, capacity };
    commit(); toast("Price set and disclosed to the room.");
  });

  on("do-compute", () => { computeAllocation(); commit(); toast("Allocation computed — numbers tie out."); });
  on("to-approve", () => { shared.stage = "approve"; commit(); });
  on("approve-mine", (btn) => { shared.approvals[btn.dataset.key] = true; commit(); toast("Your part is approved and escrowed."); });
  on("to-close", () => { shared.stage = "close"; commit(); });
  on("fire-close", () => runClose(!!$("#fail-toggle")?.checked));
  on("retry-close", () => { shared.stage = "close"; shared.failedAttempt = false; commit(); });
  on("grant-oversight", () => { shared.oversightGranted = true; commit(); toast("Oversight window granted."); });

  on("start-deal2", () => {
    const next = shared.dealNo + 1;
    if (!DEALS[next]) { toast("That's the end of the demo reel — reset to start over."); return; }
    shared = freshState(next);
    shared.buyerVerified = true;
    commit(); toast(`Deal #${String(next).padStart(2, "0")} — returning buyer reuses verification.`);
  });

  $("#persona-select").onchange = (e) => { viewAs = e.target.value; sessionStorage.setItem(VIEW_KEY, viewAs); render(); };
  $("#reset-btn").onclick = () => { shared = freshState(1); commit(); toast("Demo reset to the start."); };

  function on(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener("click", () => fn(el)); }
  function val(id, dv) { const e = document.getElementById(id); return e ? (e.value.trim() || dv) : dv; }
  function numVal(id, dv) { const e = document.getElementById(id); const n = e ? parseFloat(e.value) : NaN; return isNaN(n) ? dv : n; }
}

// atomic close animation, then commit final state (only this tab finalizes)
let isCloseOriginator = false;
function runClose(fail) {
  isCloseOriginator = true;
  shared.closingFail = fail;   // so remote tabs animate the right outcome
  shared.stage = "closing";
  commit();

  const legEls = () => Array.from(document.querySelectorAll(".leg"));
  const step = reducedMotion() ? 0 : 180;

  if (fail) {
    legEls().forEach((el, i) => setTimeout(() => el.classList.add("filling"), i * step));
    const failAt = 3 * step + 250;
    setTimeout(() => {
      legEls().forEach((el) => { el.classList.remove("filling"); el.classList.add("failing"); el.querySelector(".st").textContent = "Failed"; });
    }, failAt);
    setTimeout(() => {
      legEls().forEach((el) => { el.classList.remove("failing"); el.classList.add("reverted"); el.querySelector(".st").textContent = "Reverted"; });
      toast("A leg failed — close rolled back. Nothing moved.", "fail");
    }, failAt + 450);
    setTimeout(() => { shared.stage = "settled"; shared.failedAttempt = true; shared.closed = false; shared.closingFail = false; commit(); }, failAt + 1100);
    return;
  }

  legEls().forEach((el, i) => setTimeout(() => {
    el.classList.add("filling");
    setTimeout(() => { el.classList.add("settled"); const st = el.querySelector(".st"); if (st) st.textContent = "Settled"; }, step);
  }, i * step));

  setTimeout(() => {
    shared.stage = "settled"; shared.failedAttempt = false; shared.closed = true; shared.closingFail = false; shared.closedAt = new Date().toISOString();
    commit(); toast("Closed — every leg settled together.");
  }, 4 * step + 400);
}

// remote tabs play the animation on a "closing" broadcast (but don't finalize)
let lastStage = shared.stage;
function maybeAnimateOnSync() {
  if (shared.stage !== "closing") isCloseOriginator = false;
  if (shared.stage === "closing" && lastStage !== "closing" && !isCloseOriginator) {
    const step = reducedMotion() ? 0 : 180;
    const fail = shared.closingFail;
    setTimeout(() => {
      const els = Array.from(document.querySelectorAll(".leg"));
      if (fail) {
        els.forEach((el, i) => setTimeout(() => el.classList.add("filling"), i * step));
        const failAt = els.length * step + 250;
        setTimeout(() => els.forEach((el) => { el.classList.remove("filling"); el.classList.add("failing"); const st = el.querySelector(".st"); if (st) st.textContent = "Failed"; }), failAt);
        setTimeout(() => els.forEach((el) => { el.classList.remove("failing"); el.classList.add("reverted"); const st = el.querySelector(".st"); if (st) st.textContent = "Reverted"; }), failAt + 450);
      } else {
        els.forEach((el, i) => setTimeout(() => {
          el.classList.add("filling");
          setTimeout(() => { el.classList.add("settled"); const st = el.querySelector(".st"); if (st) st.textContent = "Settled"; }, step);
        }, i * step));
      }
    }, 30);
  }
  lastStage = shared.stage;
}
const _render = render;
render = function () { _render(); maybeAnimateOnSync(); };

// ---------------------------------------------------------------- boot
render();
