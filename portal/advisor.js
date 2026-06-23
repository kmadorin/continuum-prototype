/* Continuum Portal — advisor.js
 * Advisor / Organizer: opens the room, invites, opens pricing, opens elections,
 * computes the allocation, fires the atomic close, grants the oversight window,
 * starts the next deal. Sees full orchestration; LP elections only as contentless
 * "filed" markers. Consumes CT.state + CT.ui; rendered by CT.page.
 */
"use strict";
(function () {
  const S = CT.state, ui = CT.ui, esc = S.esc, c = S.calc;
  const { fmtM, fmtUnits, pct } = S.fmt;
  const ROLE = "advisor";

  function workspace(s) {
    const d = s.room || S.deal();
    switch (s.stage) {
      case "setup": {
        const returning = s.dealNo > 1;
        return ui.stageHead(ROLE, "Set up the closing room",
          `Name the fund, the new vehicle, and the asset. The reference NAV and secondary price are struck off the ${esc(S.deal().navAsOf)} valuation. Invited parties see the shell — never each other's later private inputs.`)
          + ui.yourMove("Open the room to bring the parties in.")
          + `<div class="two-col" style="grid-template-columns:1fr 1fr">
              <div class="card">
                <span class="eyebrow accent card-eyebrow">Vehicle &amp; asset</span>
                <div class="form-row"><label for="f-fund">Old fund</label><input class="input" id="f-fund" value="${esc(S.deal().fund)}"></div>
                <div class="form-row"><label for="f-vehicle">New continuation vehicle</label><input class="input" id="f-vehicle" value="${esc(S.deal().vehicle)}"></div>
                <div class="form-row"><label for="f-asset">Asset transferring in</label><input class="input" id="f-asset" value="${esc(S.deal().asset)}"></div>
                <div class="actions"><button class="btn big" id="create-room">${returning ? "Clone &amp; open room" : "Open closing room"}</button></div>
                ${returning ? `<p class="mono" style="font-size:12px;color:var(--mute);margin:0">Cloned from your prior close — one click to reopen.</p>` : ""}
              </div>
              ${ui.termsCard(S.deal())}
            </div>`;
      }

      case "invite":
        return ui.stageHead(ROLE, "Bring the participants in",
          `The room is open. Invite the parties — the Buyer is verified once with a reusable eligibility credential, so they never re-onboard for future deals.`)
          + ui.yourMove("Move the deal to pricing when the roster is set.")
          + `<div class="two-col" style="grid-template-columns:1fr 1fr">
              <div class="card">
                <span class="eyebrow card-eyebrow">Roster &amp; positions</span>
                <div class="approvals">
                  ${ui.rosterRow(d.staying.name, d.staying.type, `${fmtM(d.staying.committed)} committed · ${fmtM(d.staying.nav)} NAV · ${pct(d.staying.nav / d.fundNav)}`, "Joined", "ok")}
                  ${ui.rosterRow(d.leaving.name, d.leaving.type, `${fmtM(d.leaving.committed)} committed · ${fmtM(d.leaving.nav)} NAV · ${pct(d.leaving.nav / d.fundNav)}`, "Joined", "ok")}
                  ${ui.rosterRow(d.buyer.name, `Secondary buyer · AUM ${d.buyer.aum}`, esc(d.buyer.mandate), s.buyerVerified ? "Verified ✓ reused" : "Verified ✓ once", "ok")}
                  ${ui.rosterRow("LPAC / Regulator", "Oversight", "Post-close verification window", "Observer", "sealed")}
                </div>
                <div class="actions"><button class="btn big" id="to-price">Price the deal</button></div>
              </div>
              ${ui.termsCard(d)}
            </div>`;

      case "price":
        if (!s.offer)
          return ui.stageHead(ROLE, "Price the deal",
            `The lead buyer commits a price as a % of NAV, validated by an independent fairness opinion. Once set, the price is disclosed to the room so LPs can decide roll vs sell against it.`)
            + `<div class="card" style="max-width:640px">
                <span class="eyebrow card-eyebrow">Price readiness</span>
                <div class="approvals">
                  <div class="appr"><div class="who">${esc(d.buyer.name)}<div class="obl">Lead buyer · AUM ${esc(d.buyer.aum)}</div></div><span class="chip pending">Pricing</span></div>
                </div>
                <p class="mono" style="font-size:12px;color:var(--mute);margin:0">Waiting for the lead buyer to set the price.</p>
              </div>`;
        return ui.stageHead(ROLE, "Price set &amp; fairness-validated",
          `${pct(c.buyPrice())} of NAV — within the ${pct(d.fairLow)}–${pct(d.fairHigh)} range, ${esc(d.fairnessProvider)} opinion on file. The price is public to the room. Open elections so LPs can decide roll vs sell at this price.`)
          + ui.yourMove("Open elections for the LPs.")
          + ui.priceCard(d, false)
          + `<div class="actions" style="margin-top:24px"><button class="btn big" id="to-elect">Open elections</button></div>`;

      case "elect": {
        const inCount = (s.elections.staying ? 1 : 0) + (s.elections.leaving ? 1 : 0);
        return ui.stageHead(ROLE, "Tracking elections — contents sealed",
          `Each LP decides roll vs sell at the public ${pct(c.buyPrice())} price. You see <strong>that</strong> an LP has decided, never <strong>what</strong> they chose — and no LP sees another's choice.`)
          + (inCount === 2 ? ui.yourMove("Both elections filed — work out who gets what.") : "")
          + `<div class="card" style="max-width:640px">
              <span class="eyebrow card-eyebrow">Election readiness · deadline ${esc(d.electionDeadline)}</span>
              <div class="approvals">
                ${ui.electionRow(d.staying.name, `${fmtM(d.staying.nav)} NAV position`, s.elections.staying)}
                ${ui.electionRow(d.leaving.name, `${fmtM(d.leaving.nav)} NAV position`, s.elections.leaving)}
              </div>
              <p class="mono" style="font-size:12px;color:var(--mute);margin:0">${inCount}/2 in. You see a non-revealing signal — never the roll/sell choice or the amount.</p>
              <div class="actions"><button class="btn big" id="to-compute" ${inCount === 2 ? "" : "disabled"}>Work out who gets what</button></div>
            </div>`;
      }

      case "compute":
        if (!s.allocation)
          return ui.stageHead(ROLE, "Work out who gets what",
            `Size the closing allocation from the LP elections at the <strong>set ${pct(c.buyPrice())} price</strong>. The engine resolves the book into concrete transfer legs for you to execute — each derived from the elections, the public price, and the reference NAV.`)
            + ui.yourMove("Compute the allocation from the sealed inputs.")
            + ui.twoCol(`<div class="card">
                <span class="eyebrow accent card-eyebrow">Compute close</span>
                <p class="dim" style="margin:0">Reads the sell and roll elections, applies the already-set secondary price and rollover NAV, then assembles the transfer legs and who must authorize each.</p>
                <div class="actions"><button class="btn big" id="do-compute">Compute the allocation</button></div>
              </div>`,
              ui.srCard("Inputs", "What feeds the math", null, [`Sell election: ${fmtM(c.exitNav())} NAV`, `Roll election: ${fmtM(c.rollNav())} NAV`, `Set price: ${pct(c.buyPrice())} of NAV`, `Rollover NAV: $${S.deal().navPerUnit.toFixed(2)}/unit`], false));
        return ui.stageHead(ROLE, "The close resolves into four legs",
          `Computed from the sealed inputs — each leg is derived, not invented. The numbers tie out. Next, each party approves only its own leg.`)
          + ui.arithmeticBlock()
          + `<div style="margin-top:20px">${ui.legsBlock("computed")}</div>`
          + ui.tieOutLine()
          + `<div class="actions" style="margin-top:24px"><button class="btn big" id="to-approve">Send for approvals</button></div>`;

      case "approve": {
        const obls = S.obligations();
        const list = `<div class="card"><span class="eyebrow card-eyebrow">Authorization status</span>
          <div class="approvals">
            ${obls.map((o) => `<div class="appr ${o.persona === ROLE ? "mine" : ""}">
              <div class="who">${esc(o.who)}<div class="obl">${o.obl}</div></div>
              ${s.approvals[o.key] ? `<span class="chip ok">Approved</span>` : `<span class="chip pending">Awaiting</span>`}
            </div>`).join("")}
          </div>
          ${c.allApproved()
            ? `<div class="actions"><button class="btn big" id="to-close">All legs authorized — go to close</button></div>`
            : `<p class="mono" style="font-size:12px;color:var(--mute);margin:0">${Object.values(s.approvals).filter(Boolean).length}/4 approved.</p>`}
        </div>`;
        const mine = obls.find((o) => o.persona === ROLE);
        const approved = s.approvals[mine.key];
        const actionCard = `<div class="card ${approved ? "accent" : ""}" style="max-width:580px;margin-bottom:24px">
          <span class="eyebrow ${approved ? "accent" : ""} card-eyebrow">Your obligation — the new vehicle</span>
          <h2>${mine.obl}</h2>
          ${approved ? `<span class="chip ok">Approved &amp; escrowed</span>`
            : `<div class="actions"><button class="btn big" id="approve-mine" data-key="${mine.key}">Approve my part</button></div>`}
        </div>`;
        return ui.stageHead(ROLE, "Approve my part",
          `Each party authorizes only its own obligation. No one signs for the whole book. When every leg is approved, you can fire the close.`)
          + (approved ? "" : ui.yourMove("Approve the vehicle's leg."))
          + actionCard + list;
      }

      case "close":
      case "closing": {
        const closing = s.stage === "closing";
        return ui.stageHead(ROLE, "Close — all at once",
          `One action settles every leg together: <strong>${fmtM(c.cashAmount())} USDC</strong> to ${esc(d.leaving.name)}, <strong>${fmtUnits(c.unitsIssued())}</strong> to the staying investor and buyer, the asset into ${esc(d.vehicleShort)}. <strong>All-or-nothing</strong> — if any leg fails, nothing moves.`)
          + (closing ? "" : ui.yourMove("Fire the atomic close."))
          + ui.legsBlock("computed")
          + `<div class="card" style="margin-top:24px">
              <div class="actions" style="justify-content:space-between">
                <button class="btn big" id="fire-close" ${closing ? "disabled" : ""}>${closing ? "Settling…" : "CLOSE — ALL AT ONCE"}</button>
                <label class="fail-toggle"><input type="checkbox" id="fail-toggle"> Simulate a failed leg</label>
              </div>
              <p class="mono" style="font-size:12px;color:var(--mute);margin:0">Settles T+0 atomic. With the failure toggle on, one leg fails mid-settle and the whole close rolls back — no leg moves.</p>
            </div>`;
      }

      case "settled": {
        if (s.failedAttempt)
          return ui.stageHead(ROLE, "Close reverted — nothing moved",
            `A leg failed, so the whole transaction rolled back. No cash moved, no units issued, no asset transferred. Every party is exactly where it started.`)
            + `<div class="callout fail"><div class="ct">Atomic — all or nothing</div><p>One failed leg unwinds the entire close. There is no partial settlement to clean up.</p></div>`
            + `<div style="margin-top:20px">${ui.legsBlock("reverted")}</div>`
            + `<div class="actions" style="margin-top:24px"><button class="btn big" id="retry-close">Back to close — try again</button></div>`;
        return ui.stageHead(ROLE, "Closed — all at once",
          `One settlement moved every leg simultaneously — T+0 atomic. No LP saw another LP's roll-or-sell choice, the close was all-or-nothing, and the cash settled in USDC.`)
          + ui.beforeAfterStatement(ROLE, d)
          + `<div class="card"><span class="eyebrow accent card-eyebrow">Settled ledger — one atomic transaction</span>${ui.positionsBlock(d)}${ui.closedStamp()}</div>`
          + `<div class="card accent" style="margin-top:24px">
              <span class="eyebrow accent card-eyebrow">Flywheel</span>
              <h2>Start the next deal</h2>
              <p class="dim" style="margin:0">The returning buyer reuses their verification and prices the next deal in one click — no re-onboarding. That's the network effect.</p>
              <div class="actions"><button class="btn big" id="start-deal2">Start deal #${String(s.dealNo + 1).padStart(2, "0")}</button>
              ${s.oversightGranted ? `<span class="chip ok">Oversight window granted</span>` : `<button class="btn ghost" id="grant-oversight">Grant oversight window</button>`}</div>
            </div>`;
      }
      default: return ui.locked("Loading", "Preparing the deal.");
    }
  }

  function wire(root) {
    const on = (id, fn) => { const el = root.querySelector("#" + id); if (el) el.addEventListener("click", () => fn(el)); };
    const val = (id, dv) => { const e = root.querySelector("#" + id); return e ? (e.value.trim() || dv) : dv; };

    on("create-room", () => { S.actions.createRoom({ fund: val("f-fund"), vehicle: val("f-vehicle"), asset: val("f-asset") }); CT.shell.toast("Closing room opened."); });
    on("to-price", () => { S.actions.toPrice(); CT.shell.toast("Pricing is open — lead buyer sets the price."); });
    on("to-elect", () => { S.actions.toElect(); CT.shell.toast("Elections are open at the set price."); });
    on("to-compute", () => S.actions.toCompute());
    on("do-compute", () => { S.actions.doCompute(); CT.shell.toast("Allocation computed — numbers tie out."); });
    on("to-approve", () => S.actions.toApprove());
    on("approve-mine", (b) => { S.actions.approveMine({ key: b.dataset.key }); CT.shell.toast("Your part is approved and escrowed."); });
    on("to-close", () => S.actions.toClose());
    on("fire-close", () => S.fireClose(!!root.querySelector("#fail-toggle")?.checked));
    on("retry-close", () => S.actions.retryClose());
    on("grant-oversight", () => { S.actions.grantOversight(); CT.shell.toast("Oversight window granted."); });
    on("start-deal2", () => {
      const next = S.actions.startNextDeal();
      if (next) CT.shell.toast(`Deal #${String(next).padStart(2, "0")} — returning buyer reuses verification.`);
      else CT.shell.toast("That's the end of the demo reel — reset to start over.");
    });
  }

  function dashCards(s) {
    const d = s.room || S.deal();
    return `<div class="dash-cards">
      <div class="dc"><span class="dc-lab">Continuation vehicle</span><span class="dc-val">${esc(d.vehicleShort)}</span><span class="dc-note">${esc(d.assetShort)} · ${fmtM(d.fundNav)} fund NAV</span></div>
      <div class="dc"><span class="dc-lab">Set price</span><span class="dc-val">${s.offer ? `<span class="figure">${pct(c.buyPrice())}</span> of NAV` : "—"}</span><span class="dc-note">${s.offer ? `${esc(d.fairnessProvider)} validated` : "awaiting buyer"}</span></div>
      <div class="dc"><span class="dc-lab">Approvals</span><span class="dc-val"><span class="figure">${Object.values(s.approvals).filter(Boolean).length}/4</span></span><span class="dc-note">legs authorized</span></div>
    </div>`;
  }

  CT.page.run({ role: ROLE, workspace, wire, dashCards,
    dashIntro: () => ({ title: "Your closings", lede: "You orchestrate the continuation close end to end — open the room, price with the buyer, compute the allocation, and settle every leg at once." }) });
})();
