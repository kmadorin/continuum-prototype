/* Continuum Portal — oversight.js
 * Oversight — LPAC: nothing pre-close; a scoped, post-close fairness view once
 * the advisor grants the window. Never sees the live private inputs.
 */
"use strict";
(function () {
  const S = CT.state, ui = CT.ui, esc = S.esc, c = S.calc;
  const { fmtM, pct } = S.fmt;
  const ROLE = "oversight";

  function workspace(s) {
    const d = s.room || S.deal();

    if (s.stage === "settled") {
      if (s.failedAttempt)
        return ui.stageHead(ROLE, "The close did not complete",
          `A leg failed and the whole transaction rolled back. Nothing settled, so there is nothing to verify. Every party is exactly where it started.`)
          + ui.locked("No settlement to review", "Atomic close means a failed attempt leaves no partial state. Your verification window opens when a close completes.");
      return regulatorView(s, d);
    }

    // pre-close: oversight has no window into live inputs at any stage
    const settling = s.stage === "closing";
    return ui.stageHead(ROLE, settling ? "Settling…" : "Sealed until close",
      `Per the rules, your scoped verification window opens only after the close — never the live private inputs. Right now you see only that a continuation deal for ${esc(d.fund)} exists.`)
      + ui.locked("Window opens after close",
        "Before close you see only that a deal exists — never the live elections, the priced book, or who is doing what. Your scoped, need-to-know view opens once settlement completes.");
  }

  function regulatorView(s, d) {
    if (!s.oversightGranted)
      return ui.stageHead(ROLE, "Awaiting the oversight window",
        `The deal has closed. Per the rules, your scoped verification view opens once the advisor grants the post-close window — need-to-know, after the fact.`)
        + ui.locked("Window not yet open", "Before close you saw only that a deal existed. The advisor now grants a scoped, post-close view.");
    return ui.stageHead(ROLE, "Verify the close was fair",
      `A scoped, post-close window for the LPAC. You can confirm the rules were followed — without ever having seen the live private inputs.`)
      + ui.attestations(d)
      + `<div class="card" style="margin-top:1px"><span class="eyebrow card-eyebrow">Settled ledger — scoped view</span>${ui.positionsBlock(d)}${ui.closedStamp()}</div>`;
  }

  function dashCards(s) {
    const closed = s.stage === "settled" && !s.failedAttempt;
    const granted = s.oversightGranted;
    return `<div class="dash-cards">
      <div class="dc"><span class="dc-lab">Pre-close visibility</span><span class="dc-val">Sealed</span><span class="dc-note">that a deal exists — nothing more</span></div>
      <div class="dc"><span class="dc-lab">Close status</span><span class="dc-val">${closed ? "Settled" : s.failedAttempt ? "Reverted" : "In progress"}</span><span class="dc-note">${closed ? "T+0 atomic" : "awaiting settlement"}</span></div>
      <div class="dc"><span class="dc-lab">Your window</span><span class="dc-val">${granted && closed ? "Open" : "Closed"}</span><span class="dc-note">${granted && closed ? "scoped fairness view" : "opens post-close"}</span></div>
    </div>`;
  }

  CT.page.run({ role: ROLE, workspace, dashCards,
    dashIntro: () => ({ title: "Oversight queue", lede: "You verify continuation closes after the fact. Nothing is visible while a deal is live — your scoped fairness view opens once it settles." }) });
})();
