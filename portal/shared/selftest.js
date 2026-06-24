// node-only engine self-test. Run: node portal/shared/selftest.js
global.window = {};
// stub sync
let store = null; const subs = [];
global.CT = window.CT = { sync: {
  read: () => store, write: (s) => { store = JSON.parse(JSON.stringify(s)); },
  subscribe: (fn) => subs.push(fn), session: { get:()=>null,set(){},clear(){} },
} };
require("./state.js");
const S = window.CT.state, C = S.calc, F = S.fmt;
function assert(c, m) { if (!c) { console.error("FAIL:", m); process.exitCode = 1; } else console.log("ok  ", m); }

S.actions.reset();
// --- decline-to-proceed path (self-contained) ---
S.actions.openAuction();
S.actions.submitBid({ buyerId: "b1", price: 0.96, capacity: 16.0 });
S.actions.selectLead({ buyerId: "b1" });
S.actions.declineToProceed();
assert(S.get().stage === "declined", "advisor can decline to proceed (broken-deal)");
S.actions.reset();
// --- main happy path below ---
assert(S.get().stage === "setup", "starts at setup");
S.actions.openAuction();
assert(S.get().stage === "bidding", "opens auction");
// hero buyer bids
S.actions.submitBid({ buyerId: "b1", price: 0.96, capacity: 16.0 });
assert(C.bidsFiled() === 3, "3 bids filed (b1,b2,b3; b4 passed)");
S.actions.selectLead({ buyerId: "b1" });
assert(S.get().stage === "leadSelected", "book opened -> leadSelected");
assert(S.get().clearingPrice === 0.96, "clearing price 0.96 (b1 highest)");
assert(S.get().leadBuyerId === "b1", "lead = b1 Northbeam");
console.log("   sellDemand(pre-hero)", C.sellDemand(), "buyerCap", C.buyerCapacity(), "syndicate", S.get().syndicateIds);
assert(Math.abs(C.sellDemand() - 14.0) < 1e-6, "background sell demand 14.0 before hero elections");
S.actions.openLpacReview();
assert(S.get().stage === "lpacConsent", "lead -> lpacConsent (LPAC gate)");
S.actions.openElections();
assert(S.get().stage === "lpacConsent", "elections blocked until LPAC consents");
S.actions.recordConsent({});
assert(S.get().lpacConsent.granted === true, "LPAC consent recorded");
S.actions.openElections();
assert(S.get().stage === "elections", "elections open after LPAC consent");
// hero LPs file: staying splits roll 8.0 / sell 1.4 ; leaving sells all 5.0
S.actions.submitElection({ lpId: "lp1", choice: "split", rollNav: 8.0 });
S.actions.submitElection({ lpId: "lp2", choice: "sell" });
// status-quo on a background LP (lp7 seeded roll 6.5) — same NAV math, terms flag set
S.actions.submitElection({ lpId: "lp7", choice: "status-quo" });
assert(S.get().elections.lp7.choice === "status-quo", "lp7 elects status-quo");
assert(S.get().elections.lp7.terms === "existing", "status-quo carries existing-terms flag");
assert(Math.abs(S.get().elections.lp7.rollNav - 6.5) === 0, "status-quo rollNav = full NAV 6.5");
assert(Math.abs(C.sellDemand() - 20.4) < 1e-6, "sell demand 20.4 after hero elections");
assert(Math.abs(C.rollDemand() - 31.6) < 1e-6, "roll demand 31.6");
assert(Math.abs(C.sellDemand() + C.rollDemand() - 52.0) < 1e-6, "sell+roll = fund NAV 52.0");
S.actions.closeElectionsAndCompute();
console.log("   syndicate after compute", S.get().syndicateIds, "buyerCap", C.buyerCapacity());
assert(S.get().syndicateIds.length >= 1, "syndicate engaged to backstop overflow");
assert(C.oversubscribed() === false, "syndicate covers — not oversubscribed");
assert(S.get().stage === "allocation", "computed -> allocation");
const legs = S.legs();
console.log("   legs:", legs.length);
const cashOut = legs.filter(l=>l.kind==="cash").reduce((s,l)=>s+l.amount,0);
const unitsToBuyers = legs.filter(l=>l.kind==="units" && l.sub.includes("purchased")).reduce((s,l)=>s+l.amount,0);
const unitsToLps = legs.filter(l=>l.kind==="units" && l.sub.includes("rolled")).reduce((s,l)=>s+l.amount,0);
const asset = legs.find(l=>l.kind==="asset");
console.log("   cashOut", cashOut.toFixed(3), "buyerUnits", unitsToBuyers.toFixed(2), "rollUnits", unitsToLps.toFixed(2), "asset", asset.amount);
assert(Math.abs(cashOut - C.cashTotal()) < 0.01, "cash legs sum = cashTotal "+C.cashTotal());
assert(Math.abs(C.cashTotal() - 20.4*0.96) < 0.01, "cashTotal = 20.4 * 0.96 = 19.584");
assert(Math.abs(C.unitsIssued() - C.assetNavIn()) < 1e-6, "units issued = asset NAV in (tie-out)");
assert(Math.abs(C.unitsIssued() - 52.0) < 1e-6, "units issued 52.0");
S.actions.sendForApproval();
assert(S.get().stage === "approvals", "sent for approval");
// approve hero parties
S.actions.approve({ key: "advisor" });
S.actions.approve({ key: "buyer:b1" });
S.actions.approve({ key: "lp:lp1" });
S.actions.approve({ key: "lp:lp2" });
assert(S.allApproved(), "all approved after hero parties sign");
S.fireClose(false);
assert(S.get().stage === "settlement", "firing -> settlement");
setTimeout(() => {
  assert(S.get().stage === "settled" && S.get().closed, "settled & closed");
  // flywheel
  const n = S.actions.startNextDeal();
  assert(n === 2, "flywheel -> deal 2");
  assert(S.get().buyerVerified.b1 === true, "returning buyer pre-verified on deal 2");
  console.log("DONE");
}, 4000);
