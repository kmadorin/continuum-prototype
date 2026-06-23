/* Continuum Portal — shared/shell.js
 * ---------------------------------------------------------------------------
 * Shared UI chrome + reusable component builders for every role page. No
 * role-specific business logic — just presentation reused across advisor /
 * staying / leaving / buyer / oversight.
 *
 *   CT.shell.mountChrome(viewAs)     -> render topbar (brand, identity, demo
 *                                       switcher, reset), toast + sim note
 *   CT.shell.renderRail(stage)       -> vertical 8-stage progress rail HTML
 *   CT.shell.animateClose(root,fail) -> drive the atomic leg-sweep animation
 *   CT.shell.toast(msg, kind)        -> transient status message
 *   CT.ui.*                          -> stage/card/redaction/leg builders
 * Depends on: CT.state
 * ------------------------------------------------------------------------- */
"use strict";
window.CT = window.CT || {};

CT.shell = (function () {
  const S = CT.state, M = S.meta, P = M.PERSONAS, esc = S.esc;
  const reducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------- chrome
  function mountChrome(viewAs) {
    const s = S.get();
    const p = P[viewAs];
    const top = document.querySelector(".topbar");
    if (top) {
      top.innerHTML = `
        <a class="wordmark" href="index.html" aria-label="Continuum home">Continuum<span class="dot">.</span></a>
        <span class="deal-badge">Deal <b>${String(s.dealNo).padStart(2, "0")}</b></span>
        <span class="spacer"></span>
        <div class="identity">
          <span class="id-avatar" aria-hidden="true">${esc(p.initials)}</span>
          <span class="id-meta"><span class="id-name">${esc(p.person)}</span><span class="id-role">${esc(p.label)}</span></span>
        </div>
        ${demoSwitcher(viewAs)}
        <button class="btn ghost" id="ct-reset" type="button">Reset demo</button>`;

      const reset = top.querySelector("#ct-reset");
      if (reset) reset.addEventListener("click", () => { S.actions.reset(); toast("Demo reset to the start."); });
    }

    // toast + sim note (idempotent)
    if (!document.getElementById("ct-toast")) {
      const t = document.createElement("div");
      t.className = "toast"; t.id = "ct-toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite");
      document.body.appendChild(t);
    }
    if (!document.querySelector(".sim-note")) {
      const n = document.createElement("p");
      n.className = "sim-note";
      n.textContent = "Simulation — no Canton, no wallets, no network. State is in-memory.";
      document.body.appendChild(n);
    }
  }

  function demoSwitcher(viewAs) {
    const links = M.ROLE_ORDER.map((r) => {
      const pr = P[r];
      const cur = r === viewAs ? " current" : "";
      return `<a class="${cur.trim()}" href="${r}.html#/deal/${M.DEAL_ID}">${esc(pr.label)}<span class="dm-role">${esc(pr.short)}</span></a>`;
    }).join("");
    return `<details class="demo-switch">
      <summary aria-label="Demo: jump to another role">Demo · jump to role</summary>
      <div class="demo-menu">
        <div class="dm-head">View the same deal as</div>
        ${links}
        <div class="dm-foot"><a class="btn ghost" href="index.html">Back to portal</a></div>
      </div>
    </details>`;
  }

  // close the demo menu on outside click / Escape
  document.addEventListener("click", (e) => {
    const d = document.querySelector(".demo-switch[open]");
    if (d && !d.contains(e.target)) d.removeAttribute("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { const d = document.querySelector(".demo-switch[open]"); if (d) d.removeAttribute("open"); }
  });

  // ---------------------------------------------------------------- progress rail
  function renderRail(stage) {
    const cur = M.STAGE_TO_STEP[stage] ?? 0;
    const items = M.STEP_LABELS.map((s, i) => {
      const cls = i < cur ? "done" : (i === cur ? "active" : "");
      return `<li class="rl ${cls}"><span class="rn"><span>${s[0]}</span></span><span class="rt">${esc(s[1])}</span></li>`;
    }).join("");
    return `<nav class="rail" aria-label="Deal lifecycle">
      <div class="rail-head">Lifecycle · step ${Math.min(cur + 1, 8)} of 8</div>
      <ol>${items}</ol>
    </nav>`;
  }

  // ---------------------------------------------------------------- toast
  function toast(msg, kind = "") {
    const t = document.getElementById("ct-toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = "toast" + (kind ? " " + kind : ""); }, 3200);
  }

  // ---------------------------------------------------------------- close animation
  // Drives the leg sweep over the same window state.js uses to finalize.
  function animateClose(root, fail) {
    const els = Array.from((root || document).querySelectorAll(".leg"));
    if (!els.length) return;
    const step = reducedMotion() ? 0 : M.CLOSE_MS.step;

    if (fail) {
      els.forEach((el, i) => setTimeout(() => el.classList.add("filling"), i * step));
      const failAt = els.length * step + 250;
      setTimeout(() => els.forEach((el) => { el.classList.remove("filling"); el.classList.add("failing"); setSt(el, "Failed"); }), failAt);
      setTimeout(() => els.forEach((el) => { el.classList.remove("failing"); el.classList.add("reverted"); setSt(el, "Reverted"); }), failAt + 450);
    } else {
      els.forEach((el, i) => setTimeout(() => {
        el.classList.add("filling");
        setTimeout(() => { el.classList.add("settled"); setSt(el, "Settled"); }, step);
      }, i * step));
    }
  }
  function setSt(el, txt) { const st = el.querySelector(".st"); if (st) st.textContent = txt; }

  return { mountChrome, renderRail, toast, animateClose };
})();

/* ===========================================================================
   CT.ui — reusable HTML component builders shared across role workspaces.
   All read derived figures from CT.state; role-dependent builders take viewAs.
   =========================================================================== */
CT.ui = (function () {
  const S = CT.state, esc = S.esc;
  const { fmtM, fmtUnits, pct } = S.fmt;
  const c = S.calc;
  const deal = S.deal;

  function stageHead(viewAs, title, lede) {
    const p = S.meta.PERSONAS[viewAs];
    return `<div class="stage-head">
      <span class="persona-tag">${esc(p.label)} <span class="role">· ${esc(p.role)}</span></span>
      <h1>${title}</h1>
      <p class="lede">${lede}</p>
    </div>`;
  }

  function yourMove(text) {
    return `<div class="your-move"><span class="ym-dot" aria-hidden="true"></span>
      <span class="ym-text"><b>Your move</b>${text}</span></div>`;
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

  function priceCard(d, accent) {
    return `<div class="card ${accent ? "accent" : ""}" style="max-width:600px">
      <span class="eyebrow ${accent ? "accent" : ""} card-eyebrow">The deal price · public to the room</span>
      <dl class="kv">
        <dt>Secondary price</dt><dd><span class="figure">${pct(c.buyPrice())}</span> of NAV</dd>
        <dt>Per $1.00 NAV</dt><dd><span class="figure">$${c.buyPrice().toFixed(2)}</span> USDC to a seller</dd>
        <dt>Fairness opinion</dt><dd>${esc(d.fairnessProvider)} <span class="mute mono" style="font-size:12px">· validates ${pct(c.buyPrice())} within ${pct(d.fairLow)}–${pct(d.fairHigh)}</span></dd>
        <dt>Lead buyer</dt><dd>${esc(d.buyer.name)} · absorbs up to <span class="figure">${fmtM(c.buyCapacity())}</span> NAV</dd>
      </dl>
      <span class="chip ok">Fairness-validated · disclosed to all parties</span>
    </div>`;
  }

  function electionRow(name, detail, val) {
    const chip = val ? `<span class="chip ok">Election in</span>` : `<span class="chip pending">Awaiting</span>`;
    return `<div class="appr"><div class="who">${esc(name)}<div class="obl">${esc(detail)}</div></div>${chip}</div>`;
  }

  function redactBar(w) { return `<span class="redact" style="width:${w}px"></span>`; }

  // peer redaction — "you can't see this" treatment
  function sealedPeek(otherKey) {
    const s = S.get();
    const other = s.room[otherKey].name;
    const has = !!s.elections[otherKey];
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

  function legMain(l) { return `<span class="figure">${esc(l.mainFig)}</span>${esc(l.mainSuffix)}`; }

  function legsBlock(state, only) {
    const s = S.get();
    if (!s.allocation) return "";
    const legs = s.allocation.legs.filter((l) => !only || only.includes(l.n));
    const cls = state === "settled" ? "settled" : state === "reverted" ? "reverted" : "";
    const label = state === "settled" ? "Settled" : state === "reverted" ? "Reverted" : "Pending";
    return `<div class="legs">${legs.map((l) => `
      <div class="leg ${cls}" data-leg="${l.n}">
        <span class="sweep" aria-hidden="true"></span>
        <span class="ln">${l.n}</span>
        <span class="desc"><span class="d-main">${legMain(l)}</span><span class="d-sub">${esc(l.sub)}</span></span>
        <span class="st">${label}</span>
      </div>`).join("")}</div>`;
  }

  function arithmeticBlock() {
    const d = deal();
    const rows = [
      [`Exiting · ${esc(d.leaving.name)}`, `${fmtM(c.exitNav())} NAV × ${pct(c.buyPrice())} price`, `${fmtM(c.cashAmount())} USDC`],
      [`Buyer units`, `${fmtM(c.buyNav())} NAV ÷ $${d.navPerUnit.toFixed(2)} rollover NAV`, `${fmtUnits(c.buyerUnits())}`],
      [`Rolling · ${esc(d.staying.name)}`, `${fmtM(c.rollNav())} NAV ÷ $${d.navPerUnit.toFixed(2)} rollover NAV`, `${fmtUnits(c.rollUnits())}`],
      [`Asset into ${esc(d.vehicleShort)}`, `${fmtM(c.rollNav())} + ${fmtM(c.buyNav())} NAV`, `${fmtM(c.assetNav())}`],
    ];
    return `<div class="card"><span class="eyebrow card-eyebrow">Allocation arithmetic</span>
      <table class="calc"><tbody>
        ${rows.map((r) => `<tr><td class="c-lab">${r[0]}</td><td class="c-mid mono">${r[1]}</td><td class="c-out mono">= ${r[2]}</td></tr>`).join("")}
      </tbody></table>
    </div>`;
  }

  function tieOutLine() {
    return `<div class="callout" style="margin-top:1px"><div class="ct">Tie-out · sum in = sum out</div>
      <p>Units issued <span class="mono">${fmtUnits(c.unitsIssued())}</span> = asset NAV transferred in <span class="mono">${fmtM(c.assetNav())}</span>. Cash leg balances: buyer <span class="mono">−${fmtM(c.cashAmount())}</span> = ${esc(deal().leaving.name)} <span class="mono">+${fmtM(c.cashAmount())}</span>.</p></div>`;
  }

  function positionsBlock(d) {
    const cash = c.cashAmount();
    return `<div class="positions">
      <div class="pos"><span class="who">${esc(d.leaving.name)} · leaving</span><span class="delta gain">+ ${fmtM(cash)} USDC</span><span class="note">${fmtM(c.exitNav())} NAV → cash at ${pct(c.buyPrice())}</span></div>
      <div class="pos"><span class="who">${esc(d.staying.name)} · staying</span><span class="delta gain">+ ${fmtUnits(c.rollUnits())}</span><span class="note">${fmtM(c.rollNav())} NAV rolled</span></div>
      <div class="pos"><span class="who">${esc(d.buyer.name)} · buyer</span><span class="delta move">− ${fmtM(cash)} USDC · + ${fmtUnits(c.buyerUnits())}</span><span class="note">paid ${pct(c.buyPrice())} of NAV</span></div>
      <div class="pos"><span class="who">${esc(d.vehicleShort)}</span><span class="delta move">+ ${esc(d.assetShort)} · ${fmtM(c.assetNav())}</span><span class="note">issued ${fmtUnits(c.unitsIssued())}</span></div>
    </div>`;
  }

  function closedStamp() {
    const s = S.get();
    const t = s.closedAt ? new Date(s.closedAt) : null;
    const when = t ? t.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
    return `<p class="mono" style="font-size:12px;color:var(--mute);margin:0">Settled T+0 atomic · closed ${esc(when)}</p>`;
  }

  function beforeAfterStatement(viewAs, d) {
    const cash = c.cashAmount();
    let title, before, after, note;
    if (viewAs === "leaving") {
      title = "You cashed out";
      before = `${fmtUnits(d.leaving.nav / d.navPerUnit)} · ${fmtM(d.leaving.nav)} NAV in ${esc(d.fund)}`;
      after  = `${fmtM(cash)} USDC · 0 fund units`;
      note   = `Realized ${pct(c.buyPrice())} of NAV on ${fmtM(c.exitNav())}.`;
    } else if (viewAs === "staying") {
      title = "You rolled over";
      before = `${fmtUnits(d.staying.nav / d.navPerUnit)} · ${fmtM(d.staying.nav)} NAV in ${esc(d.fund)}`;
      after  = `${fmtUnits(c.rollUnits())} · ${fmtM(c.rollNav())} NAV in ${esc(d.vehicleShort)}`;
      note   = `Rolled ${fmtM(c.rollNav())} of your ${fmtM(d.staying.nav)} NAV at $${d.navPerUnit.toFixed(2)} NAV/unit.`;
    } else if (viewAs === "buyer") {
      title = "Your purchase settled";
      before = `${fmtM(cash)} USDC available · eligibility verified`;
      after  = `${fmtUnits(c.buyerUnits())} · ${fmtM(c.buyNav())} NAV in ${esc(d.vehicleShort)} · −${fmtM(cash)} USDC`;
      note   = `Paid ${pct(c.buyPrice())} of NAV. Eligibility stays verified for the next deal.`;
    } else {
      title = "The vehicle is funded";
      before = `— (vehicle empty pre-close)`;
      after  = `Holds ${esc(d.assetShort)} (${fmtM(c.assetNav())} NAV) · issued ${fmtUnits(c.unitsIssued())}`;
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

  function attestations(d) {
    return `<div class="card"><span class="eyebrow accent card-eyebrow">Fairness attestations</span>
      <ul class="attest">
        <li><span class="ck" aria-hidden="true"></span><div>Price set before elections &amp; within the fairness range<small>${pct(c.buyPrice())} of NAV · range ${pct(d.fairLow)}–${pct(d.fairHigh)} · ${esc(d.fairnessProvider)} fairness opinion on file, disclosed to all LPs</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>GP conflict disclosed<small>GP rolls a ${esc(d.gpCommit)} commitment into ${esc(d.vehicleShort)}; conflict disclosed to the LPAC</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>LPAC consent obtained<small>Advisory committee approved the terms ahead of the ${esc(d.electionDeadline)} deadline</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Settled in one atomic transaction<small>4 of 4 legs · T+0 · no partial settlement possible</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Each LP's election stayed private from other LPs<small>No LP saw another LP's roll-or-sell choice until close</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Cash settled in a USD stablecoin<small>${fmtM(c.cashAmount())} USDC — not a volatile coin</small></div></li>
      </ul>
    </div>`;
  }

  return {
    stageHead, yourMove, locked, twoCol, srCard, termsCard, rosterRow, positionPanelBody,
    priceCard, electionRow, sealedPeek, legsBlock, arithmeticBlock, tieOutLine,
    positionsBlock, closedStamp, beforeAfterStatement, attestations, redactBar,
  };
})();
