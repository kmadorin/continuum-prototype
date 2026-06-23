/* Continuum Portal — leaving.js
 * Investor — Leaving (Exiting LP): privately sells its position at the set price;
 * approves the cash-delivery leg. Sees its own election, the public price, and
 * the other LP redacted.
 */
"use strict";
(function () {
  const S = CT.state, ui = CT.ui, esc = S.esc, c = S.calc;
  const { fmtM, fmtUnits, pct } = S.fmt;
  const ROLE = "leaving";          // exiting LP
  const OTHER = "staying";
  const APPROVE_KEY = "leaving";   // owns the cash-delivery leg

  function workspace(s) {
    const d = s.room || S.deal();
    const me = d[ROLE];

    switch (s.stage) {
      case "setup":
        return ui.stageHead(ROLE, "Waiting for the room to open",
          `The advisor is setting up the deal. You'll be brought in as soon as the closing room opens.`)
          + ui.locked("Room not open yet", "The advisor names the fund, vehicle and asset and strikes the terms off the reference NAV, then invites the parties. Nothing for you to do yet.");

      case "invite":
        return ui.stageHead(ROLE, "You're in the room",
          `You've joined the closing room for ${esc(d.vehicleShort)}. Here's your position in ${esc(d.fund)} — the advisor will open elections shortly.`)
          + `<div class="card" style="max-width:580px"><span class="eyebrow card-eyebrow">Your position in the fund</span>${ui.positionPanelBody(me, d)}</div>`;

      case "price":
        if (!s.offer)
          return ui.stageHead(ROLE, "Waiting for the deal price",
            `The lead buyer is setting the secondary price, validated by an independent fairness opinion. You'll decide roll vs sell against it next.`)
            + `<div class="card" style="max-width:580px"><span class="eyebrow card-eyebrow">Your position in the fund</span>${ui.positionPanelBody(me, d)}</div>`;
        return ui.stageHead(ROLE, "The deal price is set",
          `The secondary buyer will pay <strong>${pct(c.buyPrice())} of NAV</strong>, validated by ${esc(d.fairnessProvider)}. You'll decide roll vs sell against this price next — your choice stays private from other LPs.`)
          + ui.priceCard(d, false)
          + `<div class="card" style="max-width:600px;margin-top:1px"><span class="eyebrow card-eyebrow">Your position in the fund</span>${ui.positionPanelBody(me, d)}</div>`;

      case "elect": {
        const mine = s.elections[ROLE];
        if (mine)
          return ui.stageHead(ROLE, "Your election is in — private from other LPs",
            `Submitted privately. No other LP can see your roll-or-sell choice; the advisor sees only that you've decided. Binding at the ${esc(d.electionDeadline)} deadline.`)
            + `<div class="card accent" style="max-width:580px">
                <span class="eyebrow accent card-eyebrow">Your private election</span>
                <dl class="kv">
                  <dt>Decision</dt><dd>${mine.choice === "roll" ? "Roll into " + esc(d.vehicleShort) : "Sell at " + pct(c.buyPrice()) + " of NAV"}</dd>
                  <dt>Amount</dt><dd><span class="figure">${fmtM(mine.amount)}</span> NAV${mine.choice === "roll" ? "" : ` · ${fmtM(+(mine.amount * c.buyPrice()).toFixed(2))} USDC`}</dd>
                  <dt>Of your position</dt><dd>${fmtM(me.nav)} NAV · ${pct(mine.amount / me.nav)} elected</dd>
                </dl>
                <span class="chip ok">Submitted privately</span>
              </div>`
            + ui.sealedPeek(OTHER);

        return ui.stageHead(ROLE, "Decide: roll or sell",
          `The price is set at <strong>${pct(c.buyPrice())} of NAV</strong> (fairness-validated by ${esc(d.fairnessProvider)}). Choose privately whether to roll into ${esc(d.vehicleShort)} or sell at that price — and for how much of your ${fmtM(me.nav)} NAV. <strong>No other LP sees your choice.</strong>`)
          + ui.yourMove("File your roll-or-sell election — it stays private.")
          + ui.twoCol(`<div class="card">
              <span class="eyebrow accent card-eyebrow">Your election — private from other LPs</span>
              <div class="choice-row" id="choice-row">
                <button class="choice" data-choice="roll" aria-pressed="false"><span class="ct">Roll over</span><span class="cd">Stay in — receive ${esc(d.vehicleShort)} units</span></button>
                <button class="choice" data-choice="exit" aria-pressed="true"><span class="ct">Sell</span><span class="cd">Take ${pct(c.buyPrice())} of NAV — receive USDC</span></button>
              </div>
              <div class="form-row"><label for="el-amt">Amount to sell — of ${fmtM(me.nav)} NAV (max)</label>
                <div class="input-group"><span class="prefix">$</span><input class="input num" id="el-amt" type="number" min="0" max="${me.nav}" step="0.1" value="${d.leaving.exit.toFixed(1)}"><span class="suffix">M NAV</span></div>
              </div>
              <p class="mono" style="font-size:12px;color:var(--mute);margin:0">Capped at your ${fmtM(me.nav)} NAV. Default if you do nothing is SELL — you're never forced to roll.</p>
              <div class="actions"><button class="btn big" id="submit-election">Submit my election privately</button></div>
            </div>`,
            `<div class="sr-card"><span class="eyebrow">The set price</span><h3>${pct(c.buyPrice())} of NAV</h3><p>Public to the room · ${esc(d.fairnessProvider)} fairness opinion on file.</p></div>`
            + `<div class="sr-card"><span class="eyebrow">Your position</span>${ui.positionPanelBody(me, d)}</div>`
            + ui.srCard("Peer privacy", "Private from other LPs", "Your roll-or-sell choice is visible only to you. Other LPs can't see it; the advisor sees only that you've decided.", ["No other LP sees your election", "Organizer sees a signal, not contents", "Binding at the deadline"], true));
      }

      case "compute":
        return ui.stageHead(ROLE, "Advisor is computing the close",
          `The engine is resolving the sealed inputs into transfer legs. You'll be asked to approve only your own part.`)
          + ui.locked("Computing the allocation", "Each party sees and signs only its own obligation — never the whole book.");

      case "approve":
        return approveView(s);

      case "close":
      case "closing": {
        const closing = s.stage === "closing";
        return ui.stageHead(ROLE, closing ? "Settling…" : "Ready to close",
          `The advisor fires a single settlement. Your pane updates the moment it lands — you see only your own leg within the atomic close.`)
          + ui.legsBlock("computed", S.ownLegs(ROLE));
      }

      case "settled":
        return settledView(s, d);

      default: return ui.locked("Loading", "Preparing the deal.");
    }
  }

  function approveView(s) {
    const obls = S.obligations();
    const mine = obls.find((o) => o.persona === ROLE);
    const approved = s.approvals[APPROVE_KEY];
    const actionCard = `<div class="card ${approved ? "accent" : ""}" style="max-width:580px;margin-bottom:24px">
      <span class="eyebrow ${approved ? "accent" : ""} card-eyebrow">Your obligation</span>
      <h2>${mine.obl}</h2>
      ${approved ? `<span class="chip ok">Approved &amp; escrowed</span>`
        : `<div class="actions"><button class="btn big" id="approve-mine" data-key="${APPROVE_KEY}">Approve my part</button></div>`}
    </div>`;
    const list = `<div class="card"><span class="eyebrow card-eyebrow">Authorization status</span>
      <div class="approvals">
        ${obls.map((o) => `<div class="appr ${o.persona === ROLE ? "mine" : ""}">
          <div class="who">${esc(o.who)}<div class="obl">${o.obl}</div></div>
          ${s.approvals[o.key] ? `<span class="chip ok">Approved</span>` : `<span class="chip pending">Awaiting</span>`}
        </div>`).join("")}
      </div>
      <p class="mono" style="font-size:12px;color:var(--mute);margin:0">${Object.values(s.approvals).filter(Boolean).length}/4 approved.</p>
    </div>`;
    return ui.stageHead(ROLE, "Approve my part",
      `Each party authorizes only its own obligation. No one signs for the whole book. When every leg is approved, the advisor can fire the close.`)
      + (approved ? "" : ui.yourMove("Approve your cash-delivery leg."))
      + actionCard + list;
  }

  function settledView(s, d) {
    if (s.failedAttempt)
      return ui.stageHead(ROLE, "Close reverted — nothing moved",
        `A leg failed, so the whole transaction rolled back. No cash moved, no units issued, no asset transferred. You're exactly where you started.`)
        + `<div class="callout fail"><div class="ct">Atomic — all or nothing</div><p>One failed leg unwinds the entire close. There is no partial settlement to clean up.</p></div>`
        + `<div style="margin-top:20px">${ui.legsBlock("reverted", S.ownLegs(ROLE))}</div>`
        + `<div class="actions" style="margin-top:24px"><span class="mono dim" style="font-size:13px">Waiting for the advisor to retry.</span></div>`;
    return ui.stageHead(ROLE, "Closed — all at once",
      `One settlement moved every leg simultaneously — T+0 atomic. No LP saw another LP's roll-or-sell choice, the close was all-or-nothing, and the cash settled in USDC.`)
      + ui.beforeAfterStatement(ROLE, d)
      + `<div class="card"><span class="eyebrow accent card-eyebrow">Settled ledger — one atomic transaction</span>${ui.positionsBlock(d)}${ui.closedStamp()}</div>`;
  }

  function wire(root) {
    root.querySelectorAll(".choice").forEach((b) => b.addEventListener("click", () => {
      root.querySelectorAll(".choice").forEach((x) => x.setAttribute("aria-pressed", "false"));
      b.setAttribute("aria-pressed", "true");
    }));
    const sub = root.querySelector("#submit-election");
    if (sub) sub.addEventListener("click", () => {
      const choice = root.querySelector('.choice[aria-pressed="true"]')?.dataset.choice || "exit";
      const amt = parseFloat(root.querySelector("#el-amt")?.value);
      S.actions.submitElection({ role: ROLE, choice, amount: amt });
      CT.shell.toast(`Election submitted privately — ${fmtM(Number.isFinite(amt) ? amt : S.deal().leaving.exit)} NAV.`);
    });
    const ap = root.querySelector("#approve-mine");
    if (ap) ap.addEventListener("click", () => { S.actions.approveMine({ key: APPROVE_KEY }); CT.shell.toast("Your part is approved and escrowed."); });
  }

  function dashCards(s) {
    const d = s.room || S.deal();
    const me = d[ROLE];
    const mine = s.elections[ROLE];
    return `<div class="dash-cards">
      <div class="dc"><span class="dc-lab">Your position</span><span class="dc-val"><span class="figure">${fmtM(me.nav)}</span> NAV</span><span class="dc-note">${pct(me.nav / d.fundNav)} of ${esc(d.fund)}</span></div>
      <div class="dc"><span class="dc-lab">Set price</span><span class="dc-val">${s.offer ? `<span class="figure">${pct(c.buyPrice())}</span> of NAV` : "—"}</span><span class="dc-note">${s.offer ? "public to the room" : "awaiting buyer"}</span></div>
      <div class="dc"><span class="dc-lab">Your election</span><span class="dc-val">${mine ? "Filed" : "Pending"}</span><span class="dc-note">${mine ? "private from other LPs" : "decide roll or sell"}</span></div>
    </div>`;
  }

  CT.page.run({ role: ROLE, workspace, wire, dashCards,
    dashIntro: () => ({ title: "Your fund interests", lede: "You decide privately whether to sell at the set price or roll into the new vehicle — and approve only your own leg. No other LP sees your choice." }) });
})();
