/* Continuum Portal — shared/page.js
 * ---------------------------------------------------------------------------
 * The per-role page runner. Each <role>.js calls CT.page.run({...}) with its
 * own workspace renderer + wiring; this module owns the boilerplate every role
 * shares: login guard, chrome mount, hash routing (dashboard #/ vs workspace
 * #/deal/D-001), the dashboard scaffold, re-render on cross-tab state changes,
 * and triggering the atomic close animation when the deal enters "closing".
 *
 *   CT.page.run({
 *     role,                       // "advisor" | "staying" | ...
 *     workspace(s),               // -> HTML for the centre action column
 *     wire(root, s),              // attach listeners to the rendered workspace
 *     dashIntro(s),               // optional { title, lede }
 *     dashCards(s),               // optional HTML for the 3 summary cards
 *   })
 * Depends on: CT.state, CT.shell, CT.ui, CT.sync
 * ------------------------------------------------------------------------- */
"use strict";
window.CT = window.CT || {};

CT.page = (function () {
  const S = CT.state, M = S.meta, esc = S.esc;

  function run(cfg) {
    const role = cfg.role;

    // login guard — arriving without a session sets one (deep links still work
    // in the demo; this just records the lens).
    if (CT.sync.session.get() !== role) CT.sync.session.set(role);

    CT.shell.mountChrome(role);

    const main = document.querySelector("main");
    let lastStage = S.get().stage;

    function updateBadge() {
      const b = document.querySelector(".deal-badge b");
      if (b) b.textContent = String(S.get().dealNo).padStart(2, "0");
    }

    function stageLabel(stage) { return M.STEP_LABELS[M.STAGE_TO_STEP[stage] ?? 0][1]; }
    function stageChip(s) {
      if (s.stage === "settled") return s.failedAttempt
        ? `<span class="chip fail">Close reverted</span>`
        : `<span class="chip ok">Settled</span>`;
      if (s.stage === "closing") return `<span class="chip pending">Settling…</span>`;
      return `<span class="chip ok">In progress</span>`;
    }

    function dashboard(s) {
      const d = S.deal();
      const intro = cfg.dashIntro ? cfg.dashIntro(s) : {
        title: `Welcome, ${esc(M.PERSONAS[role].person)}`,
        lede: `Your deals on Continuum. Open the active continuation close to see your part — everything else stays sealed until you need it.`,
      };
      const actionReq = S.actionRequiredFor(role);
      const badge = actionReq ? `<span class="badge-action">Action required</span>` : "";
      const stepN = (M.STAGE_TO_STEP[s.stage] ?? 0) + 1;

      const cards = cfg.dashCards ? cfg.dashCards(s) : "";

      return `<header class="dash-head">
          <span class="eyebrow accent">${esc(M.PERSONAS[role].label)}</span>
          <h1>${intro.title}</h1>
          <p>${intro.lede}</p>
        </header>
        <p class="section-label">Active deals</p>
        <div class="deal-list">
          <button class="deal-row" type="button" data-open>
            <span class="dr-main">
              <span class="dr-title">${esc(d.vehicleShort)}</span>
              <span class="dr-sub">${M.DEAL_ID} · ${esc(d.fund)} · ${esc(d.vintage)}</span>
            </span>
            <span class="dr-meta">
              ${badge}
              ${stageChip(s)}
              <span class="dr-stage"><b>Step ${Math.min(stepN, 8)}/8</b>${esc(stageLabel(s.stage))}</span>
            </span>
          </button>
        </div>
        ${cards}`;
    }

    function workspace(s) {
      const rail = CT.shell.renderRail(s.stage);
      const center = cfg.workspace(s);
      return rail + `<div class="ws-main">
        <a class="ws-back" href="#/">All deals</a>
        ${center}
      </div>`;
    }

    function render() {
      const s = S.get();
      S.clearOriginatorIfDone();
      updateBadge();

      const inWorkspace = location.hash.indexOf("#/deal/") === 0;
      if (inWorkspace) {
        main.className = "ws";
        main.innerHTML = workspace(s);
        if (cfg.wire) cfg.wire(main, s);
      } else {
        main.className = "dash";
        main.innerHTML = dashboard(s);
        const open = main.querySelector("[data-open]");
        if (open) open.addEventListener("click", () => { location.hash = "#/deal/" + M.DEAL_ID; });
      }

      // trigger the leg sweep when the deal has just entered "closing"
      if (s.stage === "closing" && lastStage !== "closing") {
        CT.shell.animateClose(main, s.closingFail);
      }
      lastStage = s.stage;
    }

    S.subscribe(render);
    window.addEventListener("hashchange", render);
    render();
  }

  return { run };
})();
