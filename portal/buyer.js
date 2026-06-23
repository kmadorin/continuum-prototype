/* Continuum Portal — buyer.js
 * Secondary Buyer: commits the price (% of NAV) and capacity, approves the cash
 * leg, and reuses one verified eligibility credential across deals. Sees its own
 * bid and the public price; never the LPs' private elections.
 */
"use strict";
(function () {
  const S = CT.state, ui = CT.ui, esc = S.esc, c = S.calc;
  const { fmtM, fmtUnits, pct } = S.fmt;
  const ROLE = "buyer";
  const APPROVE_KEY = "buyer";     // owns the cash-escrow leg

  function workspace(s) {
    const d = s.room || S.deal();

    switch (s.stage) {
      case "setup":
        return ui.stageHead(ROLE, "Waiting for the room to open",
          `The advisor is setting up the continuation deal. You'll be brought in as soon as the closing room opens.`)
          + ui.locked("Room not open yet", "You'll join with a reusable eligibility credential — no fresh onboarding for this deal.");

      case "invite":
        return ui.stageHead(ROLE, "You're in the room",
          `You've joined the closing room for ${esc(d.vehicleShort)}. Your eligibility is verified once and reusable — you won't re-onboard for the next deal.`)
          + `<div class="card accent" style="max-width:580px">
              <span class="eyebrow accent card-eyebrow">Eligibility credential</span>
              <h2>${s.buyerVerified ? "Verified investor — reused" : "Verified investor"}</h2>
              <dl class="kv">
                <dt>Holder</dt><dd>${esc(d.buyer.name)}</dd>
                <dt>AUM</dt><dd>${esc(d.buyer.aum)}</dd>
                <dt>Mandate</dt><dd>${esc(d.buyer.mandate)}</dd>
                <dt>KYC status</dt><dd>${esc(d.buyer.kyc)}</dd>
                <dt>Status</dt><dd><span class="chip ok">Active</span></dd>
              </dl>
              <p class="dim" style="font-size:13px;margin:0">Issued once by the KYC issuer; carries across advisors and deals. ${s.buyerVerified ? "Reused from your earlier close — zero re-onboarding." : "You'll reference it when you price the deal."}</p>
            </div>`;

      case "price": {
        if (s.offer)
          return ui.stageHead(ROLE, "Your price is set — and public to the room",
            `Committed against your reusable eligibility and validated by an independent ${esc(d.fairnessProvider)} fairness opinion. Selling LPs see this price and decide roll vs sell against it.`)
            + ui.priceCard(d, true);
        const returning = s.buyerVerified && s.dealNo > 1;
        return ui.stageHead(ROLE, "Price the deal",
          `Commit a price as a % of NAV for the exiting interest, and how much you'll absorb. ${returning ? "Your eligibility is already verified — price in one click." : "Referenced against your verified eligibility."} An independent ${esc(d.fairnessProvider)} fairness opinion validates it, then it's <strong>disclosed to the room</strong>.`)
          + ui.yourMove("Set the price and disclose it to the room.")
          + ui.twoCol(`<div class="card">
              <span class="eyebrow accent card-eyebrow">Set the price — negotiated lead</span>
              <div class="form-row"><label for="of-price">Price — % of NAV (fairness range ${pct(d.fairLow)}–${pct(d.fairHigh)})</label>
                <div class="input-group"><input class="input num" id="of-price" type="number" min="0" max="1.2" step="0.01" value="${S.deal().buyer.price.toFixed(2)}"><span class="suffix">× NAV</span></div>
              </div>
              <div class="form-row"><label for="of-capacity">Capacity — NAV you'll absorb</label>
                <div class="input-group"><span class="prefix">$</span><input class="input num" id="of-capacity" type="number" min="0" step="0.1" value="${S.deal().buyer.navBuy.toFixed(1)}"><span class="suffix">M NAV</span></div>
              </div>
              ${returning ? `<div class="callout"><div class="ct">Returning buyer</div><p>Eligibility reused — no re-onboarding. Set your price in one click.</p></div>` : ""}
              <div class="actions"><button class="btn big" id="submit-price">${returning ? "Reuse &amp; price — one click" : "Set price &amp; disclose to room"}</button></div>
            </div>`,
            ui.srCard("Public, negotiated price", "R1 — single lead buyer", "You set one price for the exiting interest; a fairness opinion validates it; LPs then accept or decline it. Not a live auction.", ["Price is public to all parties", `Fairness opinion by ${d.fairnessProvider}`, "If sell-demand exceeds capacity, the lead/syndicate backstops · pro-rata"], true));
      }

      case "elect":
        return ui.stageHead(ROLE, "LPs are deciding at your price",
          `Your price is set and public. LPs are now privately choosing roll vs sell against it. You'll absorb the sell elections up to your stated capacity.`)
          + ui.locked("Waiting on LP elections", "Each LP's roll-or-sell choice is private from other LPs. You'll receive the units for whatever they sell.");

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
          `The advisor fires a single settlement. Your pane updates the moment it lands — you see only your own legs within the atomic close.`)
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
      + (approved ? "" : ui.yourMove("Escrow the cash and approve your leg."))
      + actionCard + list;
  }

  function settledView(s, d) {
    if (s.failedAttempt)
      return ui.stageHead(ROLE, "Close reverted — nothing moved",
        `A leg failed, so the whole transaction rolled back. No cash moved, no units issued. Your escrow is released; you're exactly where you started.`)
        + `<div class="callout fail"><div class="ct">Atomic — all or nothing</div><p>One failed leg unwinds the entire close. There is no partial settlement to clean up.</p></div>`
        + `<div style="margin-top:20px">${ui.legsBlock("reverted", S.ownLegs(ROLE))}</div>`
        + `<div class="actions" style="margin-top:24px"><span class="mono dim" style="font-size:13px">Waiting for the advisor to retry.</span></div>`;
    return ui.stageHead(ROLE, "Closed — all at once",
      `One settlement moved every leg simultaneously — T+0 atomic. You paid cash and received units in the same transaction, and your eligibility stays verified for the next deal.`)
      + ui.beforeAfterStatement(ROLE, d)
      + `<div class="card"><span class="eyebrow accent card-eyebrow">Settled ledger — one atomic transaction</span>${ui.positionsBlock(d)}${ui.closedStamp()}</div>`
      + `<div class="card" style="margin-top:24px">
          <span class="eyebrow card-eyebrow">Reusable eligibility</span>
          <p class="dim" style="margin:0">Your verified credential carries forward. When the next continuation deal opens, you price it in one click — no re-onboarding.</p>
        </div>`;
  }

  function wire(root) {
    const sp = root.querySelector("#submit-price");
    if (sp) sp.addEventListener("click", () => {
      const price = parseFloat(root.querySelector("#of-price")?.value);
      const capacity = parseFloat(root.querySelector("#of-capacity")?.value);
      S.actions.submitPrice({ price, capacity });
      CT.shell.toast("Price set and disclosed to the room.");
    });
    const ap = root.querySelector("#approve-mine");
    if (ap) ap.addEventListener("click", () => { S.actions.approveMine({ key: APPROVE_KEY }); CT.shell.toast("Cash escrowed — your part is approved."); });
  }

  function dashCards(s) {
    const d = s.room || S.deal();
    return `<div class="dash-cards">
      <div class="dc"><span class="dc-lab">Eligibility</span><span class="dc-val">${s.buyerVerified ? "Verified · reused" : "Verified"}</span><span class="dc-note">${esc(d.buyer.kyc)}</span></div>
      <div class="dc"><span class="dc-lab">Your price</span><span class="dc-val">${s.offer ? `<span class="figure">${pct(c.buyPrice())}</span> of NAV` : "—"}</span><span class="dc-note">${s.offer ? `absorbs ${fmtM(c.buyCapacity())} NAV` : "set the price"}</span></div>
      <div class="dc"><span class="dc-lab">Cash commitment</span><span class="dc-val">${s.offer ? `<span class="figure">${fmtM(c.cashAmount())}</span>` : "—"}</span><span class="dc-note">USDC at close</span></div>
    </div>`;
  }

  CT.page.run({ role: ROLE, workspace, wire, dashCards,
    dashIntro: () => ({ title: "Your secondary book", lede: "You price the exiting interest as a % of NAV against one reusable eligibility credential, then settle cash-for-units atomically at close." }) });
})();
