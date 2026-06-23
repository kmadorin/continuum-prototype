/* Continuum Portal — shared/app.js
 * ---------------------------------------------------------------------------
 * The whole front-end for every role. Object-centric IA: a persistent sidebar
 * (Dashboard · Deals · Tasks · Participants · Documents), a deal workspace with
 * a status-pill + progress meter header and a section sub-nav (Overview ·
 * Participants · Bids/Pricing · Elections · Allocation · Settlement · Documents ·
 * Audit). No lifecycle-as-nav, no teaching lede, no "your move" — a task queue
 * and dense tables carry the work. Every panel is projected to what the current
 * role may see; sealed inputs render redacted.
 *
 *   CT.app.run(role)   — boot a role page
 * Depends on: CT.state, CT.sync
 * ------------------------------------------------------------------------- */
"use strict";
window.CT = window.CT || {};

CT.app = (function () {
  const S = CT.state, M = S.meta, P = M.PERSONAS, esc = S.esc;
  const { fmtM, fmtUnits, pct } = S.fmt, C = S.calc;
  const reduced = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  let ROLE = "advisor";
  const DEAL_HASH = () => "deal/" + S.deal().id;

  // ---- icons (inline, monochrome; established-minimal set) -------------------
  const ICON = {
    dash: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="1.5" y="1.5" width="5" height="5"/><rect x="9.5" y="1.5" width="5" height="5"/><rect x="1.5" y="9.5" width="5" height="5"/><rect x="9.5" y="9.5" width="5" height="5"/></svg>',
    deals: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="2" y="3" width="12" height="10"/><path d="M2 6h12"/></svg>',
    tasks: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M3 4.5l1.5 1.5L7 3"/><path d="M9 4.5h4"/><path d="M3 11l1.5 1.5L7 9.5"/><path d="M9 11h4"/></svg>',
    people: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><circle cx="6" cy="5" r="2.3"/><path d="M2 13c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5"/><path d="M11 4.5a2 2 0 0 1 0 4M11.5 13c0-2-.8-3-2-3.4"/></svg>',
    docs: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><path d="M4 1.5h5l3 3v10H4z"/><path d="M9 1.5V5h3"/></svg>',
  };

  // ---- which sections a role may navigate ------------------------------------
  function sectionsFor(role) {
    if (role === "advisor") return M.SECTIONS.slice();
    if (role === "buyer") return ["overview", "participants", "bids", "allocation", "settlement", "documents", "audit"];
    if (role === "oversight") return ["overview", "participants", "allocation", "settlement", "documents", "audit"];
    return ["overview", "participants", "elections", "allocation", "settlement", "documents", "audit"]; // LP
  }
  const isLP = (role) => P[role].entity.kind === "lp";
  const myLpId = (role) => P[role].entity.id;
  const myBuyerId = (role) => P[role].entity.id;

  // oversight is locked out of detail until close
  function locked(role, section) {
    if (role !== "oversight") return false;
    if (S.get().closed) return false;
    return section !== "overview";
  }

  // ========================================================== chrome
  function boot(role) {
    ROLE = role;
    if (CT.sync.session.get() !== role) CT.sync.session.set(role);
    document.body.innerHTML = `
      <div class="appshell">
        <aside class="sidebar"></aside>
        <div class="appmain">
          <a class="skip-link" href="#view">Skip to content</a>
          <header class="topbar app"></header>
          <main class="appbody" id="view" tabindex="-1"></main>
        </div>
      </div>
      <div class="toast" id="ct-toast" role="status" aria-live="polite"></div>
      <p class="sim-note">Simulation — no Canton, no wallets, no network. State is in-memory.</p>`;
    renderSidebar();
    renderTopbar();
    bindGlobal();
    let last = S.get().stage;
    S.subscribe((s) => {
      S.clearOriginatorIfDone();
      renderSidebar(); renderTopbar(); route();
      if (s.stage === "settlement" && last !== "settlement") animateClose(s.closingFail);
      last = s.stage;
    });
    window.addEventListener("hashchange", route);
    route();
  }

  function renderSidebar() {
    const p = P[ROLE], n = S.needsYou(ROLE);
    const path = hashParts();
    const here = path[0] || "";
    const link = (key, icon, label, count) => {
      const cur = (key === "" && (here === "" || here === "deal")) || here === key ? " current" : "";
      const badge = count ? `<span class="count">${count}</span>` : "";
      return `<a class="side-link${cur}" href="#/${key}"><span class="si" aria-hidden="true">${icon}</span><span>${label}</span>${badge}</a>`;
    };
    document.querySelector(".sidebar").innerHTML = `
      <div class="side-brand"><a class="wordmark" href="#/">Continuum<span class="dot">.</span></a></div>
      <nav class="side-nav" aria-label="Primary">
        <span class="side-sec">Workspace</span>
        ${link("", ICON.dash, "Dashboard", 0)}
        ${link("deals", ICON.deals, "Deals", 0)}
        ${link("tasks", ICON.tasks, "Tasks", n)}
        <span class="side-sec">Reference</span>
        ${link("participants", ICON.people, "Participants", 0)}
        ${link("documents", ICON.docs, "Documents", 0)}
      </nav>
      <div class="side-foot">
        <div class="identity">
          <span class="id-avatar" aria-hidden="true">${esc(p.initials)}</span>
          <span class="id-meta"><span class="id-name">${esc(p.person)}</span><span class="id-role">${esc(p.label)}</span></span>
        </div>
      </div>`;
  }

  function renderTopbar() {
    const s = S.get(), p = P[ROLE];
    document.querySelector(".topbar.app").innerHTML = `
      <span class="deal-badge">Deal <b>${String(s.dealNo).padStart(2, "0")}</b></span>
      <span class="view-label">${esc(S.deal().vehicleShort)}</span>
      <span class="spacer"></span>
      ${demoSwitcher()}
      <button class="btn ghost" id="ct-reset" type="button">Reset demo</button>`;
  }

  function demoSwitcher() {
    const links = M.ROLE_ORDER.map((r) => {
      const pr = P[r], cur = r === ROLE ? " current" : "";
      return `<a class="${cur.trim()}" href="${r}.html${location.hash || "#/"}">${esc(pr.label)}<span class="dm-role">${esc(pr.short)}</span></a>`;
    }).join("");
    return `<details class="demo-switch">
      <summary aria-label="Demo: jump to another role">Demo · jump to role</summary>
      <div class="demo-menu"><div class="dm-head">View the same deal as</div>${links}
      <div class="dm-foot"><a class="btn ghost" href="index.html">Sign out</a></div></div>
    </details>`;
  }

  function bindGlobal() {
    document.addEventListener("click", (e) => {
      if (e.target.closest("#ct-reset")) { S.actions.reset(); toast("Demo reset to the start."); location.hash = "#/"; }
      const d = document.querySelector(".demo-switch[open]");
      if (d && !d.contains(e.target)) d.removeAttribute("open");
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { const d = document.querySelector(".demo-switch[open]"); if (d) d.removeAttribute("open"); }
    });
  }

  // ========================================================== router
  function hashParts() { return (location.hash.replace(/^#\/?/, "")).split("/").filter(Boolean); }
  function route() {
    const parts = hashParts();
    const view = document.getElementById("view");
    let html;
    if (parts[0] === "deals") html = pageDeals();
    else if (parts[0] === "tasks") html = pageTasks();
    else if (parts[0] === "participants") { location.hash = "#/" + DEAL_HASH() + "/participants"; return; }
    else if (parts[0] === "documents") { location.hash = "#/" + DEAL_HASH() + "/documents"; return; }
    else if (parts[0] === "deal") html = pageWorkspace(parts[2] || "overview");
    else html = pageDashboard();
    view.innerHTML = html;
    wire(view, parts);
    if (S.get().stage === "settlement") animateClose(S.get().closingFail);
  }

  // ========================================================== dashboard
  function pageDashboard() {
    const s = S.get(), d = S.deal(), p = P[ROLE];
    return `<div class="page-head">
        <span class="eyebrow accent">${esc(p.label)}</span>
        <h1>Welcome, ${esc(p.person)}</h1>
        <span class="ph-sub">${esc(p.org)} · signed in</span>
      </div>
      ${taskQueue()}
      <div style="margin-top:26px"><p class="section-label">Deals</p>${dealList()}</div>
      <div style="margin-top:26px"><p class="section-label">At a glance</p>${dashboardMetrics()}</div>`;
  }

  function taskQueue() {
    const tasks = S.tasksFor(ROLE);
    const n = tasks.filter((t) => t.cta).length;
    const rows = tasks.length ? tasks.map((t) => `
      <div class="task${t.muted ? " muted" : ""}">
        <span class="tk-dot" aria-hidden="true"></span>
        <span class="tk-main"><span class="tk-title">${esc(t.title)}</span>
          <span class="tk-where">${esc(S.deal().vehicleShort)} · ${esc(M.SECTION_LABEL[t.section] || t.section)}</span></span>
        ${t.cta ? `<button class="btn" type="button" data-go="${esc(t.section)}">${esc(t.cta)}</button>` : `<span></span>`}
      </div>`).join("")
      : `<div class="taskq-empty">Nothing needs you right now. You'll be notified when a counterparty acts.</div>`;
    return `<div class="taskq">
      <div class="taskq-head"><span class="tq-title">Needs you</span><span class="tq-n${n ? "" : " zero"}">${n}</span></div>
      ${rows}</div>`;
  }

  function dealList() {
    const s = S.get(), d = S.deal();
    const active = dealRow(d, s, true);
    const next = S.deal().id === DEALS_OTHER() ? "" : greyRow();
    return `<div class="deal-list">${active}${nextDealRow()}</div>`;
  }
  function DEALS_OTHER() { return ""; }
  function nextDealRow() {
    // show deal 2 as a flywheel entry once deal 1 settled; else greyed pipeline
    const s = S.get();
    if (s.dealNo === 1) {
      const settled = s.stage === "settled" && s.closed;
      return `<button class="deal-row${settled ? "" : " greyed"}" type="button" ${settled ? "data-next" : "disabled"}>
        <span class="dr-main"><span class="dr-title">Brightwater CV I</span>
          <span class="dr-sub">BRW-CV-I · Brightwater Buyout Fund II · 2017 vintage</span></span>
        <span class="dr-meta">${settled ? `<span class="badge-action">Flywheel · 1-click</span>` : `<span class="chip sealed">Queued</span>`}
          <span class="dr-stage"><b>${settled ? "Ready" : "Pipeline"}</b>${settled ? "Reuse buyer credential" : "Opens after deal 01"}</span></span>
      </button>`;
    }
    return "";
  }
  function dealRow(d, s, clickable) {
    const sm = M.STAGE_META[s.stage];
    const pillCls = s.stage === "settlement" ? "settling" : (s.stage === "settled" && s.failedAttempt ? "fail" : "");
    const idx = S.stageIndex(s.stage), tot = M.STAGES.length - 1;
    const price = s.clearingPrice ? `${pct(s.clearingPrice)} of NAV` : `<span class="cell-sealed">sealed</span>`;
    return `<button class="deal-row" type="button" data-open>
      <span class="dr-main"><span class="dr-title">${esc(d.vehicleShort)}</span>
        <span class="dr-sub">${esc(d.id)} · ${esc(d.fund)} · ${esc(d.vintage)}</span></span>
      <span class="dr-meta">
        <span class="dr-figs">
          <span class="dr-fig"><span class="f-lab">Ref NAV</span><span class="f-val">${fmtM(d.fundNav)}</span></span>
          <span class="dr-fig"><span class="f-lab">Clearing</span><span class="f-val">${price}</span></span>
        </span>
        ${S.needsYou(ROLE) ? `<span class="badge-action">${S.needsYou(ROLE)} action${S.needsYou(ROLE) > 1 ? "s" : ""}</span>` : ""}
        <span class="status-pill ${pillCls}">${esc(s.stage === "settled" && s.failedAttempt ? "Reverted" : sm.pill)}</span>
        <span class="dr-stage"><b>Stage ${Math.min(idx + 1, tot + 1)}/${tot + 1}</b>${esc(sm.label)}</span>
      </span></button>`;
  }
  function greyRow() { return ""; }

  function dashboardMetrics() {
    const s = S.get(), d = S.deal();
    const cells = [
      ["Reference NAV", fmtM(d.fundNav), `${d.lps.length} LPs · as of ${d.navAsOf}`, "accent"],
      ["Clearing price", s.clearingPrice ? pct(s.clearingPrice) : "—", s.clearingPrice ? `lead ${esc(S.buyer(s.leadBuyerId).name)}` : "auction not cleared", s.clearingPrice ? "accent" : ""],
      ["Sell demand", s.electionsClosed || s.allocation ? fmtM(C.sellDemand()) : (C.electionsFiledCount() ? fmtM(C.sellDemand()) : "—"), `roll ${fmtM(C.rollDemand())}`, ""],
      ["Buyers", `${S.deal().buyers.length}`, `${C.bidsFiled()} bid · ${S.deal().buyers.length - C.bidsFiled()} passed/awaiting`, ""],
    ];
    return `<div class="metrics">${cells.map((c) => `<div class="mc"><span class="m-lab">${c[0]}</span><span class="m-val ${c[3]}">${c[1]}</span><span class="m-note">${c[2]}</span></div>`).join("")}</div>`;
  }

  // ========================================================== deals page
  function pageDeals() {
    return `<div class="page-head"><h1>Deals</h1><span class="ph-sub">Continuation closes you have a seat in</span></div>
      ${dealList()}`;
  }

  // ========================================================== tasks page
  function pageTasks() {
    return `<div class="page-head"><h1>Tasks</h1><span class="ph-sub">Everything waiting on you, across deals</span></div>
      ${taskQueue()}`;
  }

  // ========================================================== deal workspace
  function pageWorkspace(section) {
    const allowed = sectionsFor(ROLE);
    if (!allowed.includes(section)) section = "overview";
    return dealHeader() + subnav(section) + `<div class="section">${renderSection(section)}</div>`;
  }

  function dealHeader() {
    const s = S.get(), d = S.deal();
    const sm = M.STAGE_META[s.stage];
    const idx = S.stageIndex(s.stage), tot = M.STAGES.length;
    const segs = M.STAGES.map((st, i) => `<span class="seg ${i < idx ? "done" : (i === idx ? "active" : "")}"></span>`).join("");
    const pillCls = s.stage === "settlement" ? "settling" : (s.stage === "settled" && s.failedAttempt ? "fail" : "");
    const pillTxt = s.stage === "settled" && s.failedAttempt ? "Close reverted" : sm.pill;
    const clearing = s.clearingPrice ? `<span class="val accent">${pct(s.clearingPrice)}</span>` : `<span class="val sealed">sealed · in auction</span>`;
    return `<header class="dealhead">
      <div class="dh-top">
        <div><h1>${esc(d.vehicle)}</h1><div class="dh-id">${esc(d.id)} · ${esc(d.fund)} · ${esc(d.asset)}</div></div>
        <span class="dh-spacer"></span>
        <span class="status-pill ${pillCls}">${esc(pillTxt)}</span>
      </div>
      <div class="meter" aria-hidden="true">${segs}</div>
      <div class="meter-labels"><span>Setup</span><span>Auction</span><span>Elections</span><span>Allocation</span><span>Settle</span></div>
      <div class="dh-figs">
        <div class="dhf"><span class="lab">Reference NAV</span><span class="val accent">${fmtM(d.fundNav)}</span></div>
        <div class="dhf"><span class="lab">Clearing price</span>${clearing}</div>
        <div class="dhf"><span class="lab">Election deadline</span><span class="val">${esc(d.electionDeadline)}</span></div>
        <div class="dhf"><span class="lab">Investors</span><span class="val">${d.lps.length} LPs</span></div>
        <div class="dhf"><span class="lab">Buyers</span><span class="val">${d.buyers.length}</span></div>
      </div>
    </header>`;
  }

  function subnav(current) {
    const items = sectionsFor(ROLE).map((sec) => {
      const lk = locked(ROLE, sec) ? `<span class="lock" aria-hidden="true">·sealed</span>` : "";
      const cur = sec === current ? " current" : "";
      return `<a class="${cur.trim()}" href="#/${DEAL_HASH()}/${sec}">${esc(M.SECTION_LABEL[sec])}${lk}</a>`;
    }).join("");
    return `<nav class="subnav" aria-label="Deal sections">${items}</nav>`;
  }

  // ---- section dispatch ------------------------------------------------------
  function renderSection(section) {
    if (locked(ROLE, section)) return lockedSection();
    switch (section) {
      case "overview": return secOverview();
      case "participants": return secParticipants();
      case "bids": return secBids();
      case "elections": return secElections();
      case "allocation": return secAllocation();
      case "settlement": return secSettlement();
      case "documents": return secDocuments();
      case "audit": return secAudit();
      default: return secOverview();
    }
  }

  function lockedSection() {
    return `<div class="section-locked"><span class="lk" aria-hidden="true"></span>
      <h3>Sealed until close</h3>
      <p>Oversight has no live access to a deal in flight. A scoped fairness view unlocks the moment the close settles.</p></div>`;
  }

  // ========================================================== OVERVIEW
  function secOverview() {
    const s = S.get(), d = S.deal();
    let position = "";
    if (isLP(ROLE)) position = lpPositionPanel(myLpId(ROLE));
    else if (ROLE === "buyer") position = buyerPositionPanel(myBuyerId(ROLE));
    else if (ROLE === "advisor") position = advisorSummaryPanel();
    else position = oversightPanel();
    return `<div class="section-stack">
      ${position}
      <div class="metrics">
        <div class="mc"><span class="m-lab">Reference NAV</span><span class="m-val accent">${fmtM(d.fundNav)}</span><span class="m-note">${d.lps.length} LPs @ $${d.navPerUnit.toFixed(2)}/unit</span></div>
        <div class="mc"><span class="m-lab">Clearing price</span><span class="m-val ${s.clearingPrice ? "accent" : ""}">${s.clearingPrice ? pct(s.clearingPrice) : "—"}</span><span class="m-note">${s.clearingPrice ? "fairness-validated" : "auction in progress"}</span></div>
        <div class="mc"><span class="m-lab">Fairness range</span><span class="m-val">${pct(d.fairLow)}–${pct(d.fairHigh)}</span><span class="m-note">${esc(d.fairnessProvider)}</span></div>
        <div class="mc"><span class="m-lab">Deadlines</span><span class="m-val" style="font-size:14px">${esc(d.bidDeadline)}</span><span class="m-note">elect by ${esc(d.electionDeadline)}</span></div>
      </div>
      ${activityPanel(5)}
    </div>`;
  }

  function termsKV() {
    const d = S.deal(), s = S.get();
    return `<dl class="kv">
      <dt>Continuation vehicle</dt><dd>${esc(d.vehicle)}</dd>
      <dt>Asset</dt><dd>${esc(d.asset)}</dd>
      <dt>Reference NAV</dt><dd><span class="figure">${fmtM(d.fundNav)}</span> as of ${esc(d.navAsOf)}</dd>
      <dt>Clearing price</dt><dd>${s.clearingPrice ? `<span class="figure">${pct(s.clearingPrice)}</span> of NAV · lead ${esc(S.buyer(s.leadBuyerId).name)}` : `<span class="cell-sealed">set by sealed-bid auction</span>`}</dd>
      <dt>Fairness opinion</dt><dd>${esc(d.fairnessProvider)} <span class="mute mono" style="font-size:12px">· validates ${pct(d.fairLow)}–${pct(d.fairHigh)}</span></dd>
      <dt>GP commitment</dt><dd>${esc(d.gpCommit)} <span class="mute mono" style="font-size:12px">· conflict disclosed to LPAC</span></dd>
      <dt>Election deadline</dt><dd>${esc(d.electionDeadline)}</dd>
    </dl>`;
  }

  function advisorSummaryPanel() {
    return panel("Deal", termsKV(), null, `Stage ${S.stageIndex() + 1} of ${M.STAGES.length}`);
  }
  function oversightPanel() {
    return panel("Fairness summary", termsKV(), null, S.get().closed ? "Post-close scope" : "");
  }

  function lpPositionPanel(id) {
    const l = S.lp(id), d = S.deal(), e = C.electionFor(id);
    const body = `<dl class="kv">
      <dt>Committed capital</dt><dd><span class="figure">${fmtM(l.committed)}</span></dd>
      <dt>Current NAV</dt><dd><span class="figure">${fmtM(l.nav)}</span> as of ${esc(d.navAsOf)}</dd>
      <dt>Units held</dt><dd><span class="figure">${fmtUnits(l.nav / d.navPerUnit)}</span> at $${d.navPerUnit.toFixed(2)}/unit</dd>
      <dt>Ownership</dt><dd><span class="figure">${pct(l.nav / d.fundNav)}</span> of ${fmtM(d.fundNav)} fund NAV</dd>
      <dt>Your election</dt><dd>${e ? electionSummary(e) : `<span class="cell-sealed">not filed${S.get().stage === "elections" ? " — open now" : ""}</span>`}</dd>
    </dl>`;
    return panel("Your position · " + esc(l.name), body, null, esc(l.type));
  }
  function electionSummary(e) {
    if (e.choice === "roll") return `Roll <span class="figure">${fmtM(e.rollNav)}</span> NAV`;
    if (e.choice === "sell") return `Sell <span class="figure">${fmtM(e.sellNav)}</span> NAV${e.byDefault ? ` <span class="mute mono" style="font-size:12px">(default)</span>` : ""}`;
    return `Split · roll <span class="figure">${fmtM(e.rollNav)}</span> / sell <span class="figure">${fmtM(e.sellNav)}</span>`;
  }

  function buyerPositionPanel(id) {
    const b = S.buyer(id), s = S.get(), bid = s.bids[id];
    const verified = s.buyerVerified[id];
    const statusLine = bid ? (s.bidsOpen ? bidStatusText(id) : "Sealed bid filed · awaiting book open") : "No bid filed yet";
    const body = `<dl class="kv">
      <dt>Entity</dt><dd>${esc(b.name)} <span class="mute mono" style="font-size:12px">· ${esc(b.org)}</span></dd>
      <dt>Mandate</dt><dd>${esc(b.desk)}</dd>
      <dt>Eligibility</dt><dd>${verified ? `<span class="chip ok">QP · KYC verified${s.dealNo > 1 ? " · reused" : ""}</span>` : `<span class="chip pending">Verification pending</span>`}</dd>
      <dt>Your bid</dt><dd>${bid ? `<span class="figure">${pct(bid.price)}</span> of NAV · capacity ${fmtM(bid.capacity)}` : `<span class="cell-sealed">not submitted</span>`}</dd>
      <dt>Status</dt><dd>${esc(statusLine)}</dd>
    </dl>`;
    return panel("Your position · " + esc(b.name), body, null, esc(b.org));
  }
  function bidStatusText(id) {
    const s = S.get();
    if (id === s.leadBuyerId) return `Lead buyer at clearing price ${pct(s.clearingPrice)}`;
    if (s.syndicateIds.includes(id)) return `Syndicate — fills at clearing price ${pct(s.clearingPrice)}`;
    return `Outbid — clearing price ${pct(s.clearingPrice)}`;
  }

  // ========================================================== PARTICIPANTS
  function secParticipants() {
    if (ROLE === "buyer") return buyerParticipants();
    return `<div class="section-stack">${investorRegister()}${buyerRoster()}</div>`;
  }

  function investorRegister() {
    const d = S.deal(), s = S.get();
    const showElection = ROLE === "advisor" || isLP(ROLE) || (ROLE === "oversight" && s.closed);
    const rows = S.roster().map((r) => {
      const mine = isLP(ROLE) && r.id === myLpId(ROLE);
      let electionCell = "—";
      if (showElection) {
        if (!r.filed) electionCell = s.stage === "elections" ? `<span class="chip pending">Awaiting</span>` : `<span class="chip sealed">Not open</span>`;
        else if (ROLE === "advisor" && !s.closed) electionCell = `<span class="chip ok">Filed</span>${r.byDefault ? ` <span class="hint">default</span>` : ""}`;        // advisor sees ONLY "filed", never contents, pre-close
        else if (mine || ROLE === "advisor" || (ROLE === "oversight" && s.closed)) electionCell = electionSummary({ choice: r.choice, rollNav: r.rollNav, sellNav: r.sellNav, byDefault: r.byDefault });
        else electionCell = `<span class="cell-sealed"><span class="bars" aria-hidden="true"></span>sealed</span>`; // peer LP — redacted
      }
      return `<tr class="${mine ? "me" : ""}">
        <td class="nm">${esc(r.name)}${mine ? `<span class="you-tag">You</span>` : ""}<span class="sub">${esc(r.type)}</span></td>
        <td class="num">${fmtM(r.committed)}</td>
        <td class="num">${fmtM(r.nav)}</td>
        <td class="num">${pct(r.ownership)}</td>
        <td>${electionCell}</td>
      </tr>`;
    }).join("");
    const totC = d.lps.reduce((a, l) => a + l.committed, 0), totN = d.fundNav;
    const note = isLP(ROLE) ? `<div class="panel-note">You see your own election in full. Every other LP's choice is sealed from you — and yours from them.</div>` : "";
    return `<div class="panel">
      <div class="panel-head"><h2>Investor register</h2><span class="ph-meta">${d.lps.length} LPs · ${fmtM(totN)} NAV</span></div>
      <div class="panel-body flush"><table class="data">
        <thead><tr><th>Investor</th><th class="num">Committed</th><th class="num">NAV</th><th class="num">Own %</th><th>Election</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td>Total</td><td class="num">${fmtM(totC)}</td><td class="num">${fmtM(totN)}</td><td class="num">100%</td><td></td></tr></tfoot>
      </table></div>${note}</div>`;
  }

  function buyerRoster() {
    const s = S.get();
    const rows = S.bidBook().map((b) => `
      <tr class="${b.persona === "buyer" && ROLE === "buyer" ? "me" : ""}">
        <td class="nm">${esc(b.name)}<span class="sub">${esc(b.desk)}</span></td>
        <td>${esc(b.org)}</td>
        <td>${b.verified ? `<span class="chip ok">Verified</span>` : `<span class="chip pending">Pending</span>`}</td>
        <td>${buyerRosterStatus(b)}</td>
      </tr>`).join("");
    return `<div class="panel">
      <div class="panel-head"><h2>Buyer roster</h2><span class="ph-meta">${S.deal().buyers.length} invited</span></div>
      <div class="panel-body flush"><table class="data">
        <thead><tr><th>Buyer</th><th>Profile</th><th>Eligibility</th><th>Auction</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  }
  function buyerRosterStatus(b) {
    const s = S.get();
    if (b.passed) return `<span class="chip sealed">Passed</span>`;
    if (!b.filed) return `<span class="chip pending">Awaiting bid</span>`;
    if (!s.bidsOpen) return `<span class="chip ok">Bid filed</span>`;
    if (b.lead) return `<span class="chip ok">Lead</span>`;
    if (b.syndicate) return `<span class="chip ok">Syndicate</span>`;
    return `<span class="chip sealed">Outbid</span>`;
  }

  function buyerParticipants() {
    const s = S.get(), id = myBuyerId(ROLE), b = S.buyer(id);
    const cred = `<dl class="kv">
      <dt>Entity</dt><dd>${esc(b.name)}</dd>
      <dt>Mandate</dt><dd>${esc(b.desk)}</dd>
      <dt>Eligibility credential</dt><dd>${s.buyerVerified[id] ? `<span class="chip ok">QP · KYC verified${s.dealNo > 1 ? " · reused from prior deal" : ""}</span>` : `<span class="chip pending">Pending</span>`}</dd>
    </dl>`;
    return `<div class="section-stack">
      ${panel("Your credential", cred, null, esc(b.org))}
      <div class="panel"><div class="panel-head"><h2>Other participants</h2></div>
        <div class="panel-body"><p class="hint" style="margin:0">${S.deal().lps.length} LPs are in the investor register and ${S.deal().buyers.length - 1} other buyers are bidding. Their identities, positions and bids are sealed from you — you see only your own bid and, once the book opens, the clearing price.</p></div></div>
    </div>`;
  }

  // ========================================================== BIDS / PRICING
  function secBids() {
    if (ROLE === "buyer") return buyerBids();
    // advisor
    return advisorBids();
  }

  function advisorBids() {
    const s = S.get(), d = S.deal();
    const open = s.bidsOpen;
    const rows = S.bidBook().map((b) => {
      let price = "—", cap = "—", st;
      if (b.passed) { st = `<span class="chip sealed">Passed</span>`; }
      else if (!b.filed) { st = `<span class="chip pending">Awaiting</span>`; }
      else if (!open) { price = `<span class="cell-sealed"><span class="bars" aria-hidden="true"></span>sealed</span>`; cap = `<span class="cell-sealed">sealed</span>`; st = `<span class="chip ok">Bid filed</span>`; }
      else { price = `<b class="mono">${pct(b.price)}</b>`; cap = fmtM(b.capacity); st = b.lead ? `<span class="chip ok">Lead</span>` : (b.syndicate ? `<span class="chip ok">Syndicate</span>` : `<span class="chip sealed">Outbid</span>`); }
      return `<tr><td class="nm">${esc(b.name)}<span class="sub">${esc(b.desk)}</span></td>
        <td class="num">${price}</td><td class="num">${cap}</td><td>${st}</td></tr>`;
    }).join("");
    const filed = C.bidsFiled();
    let foot = "";
    if (s.stage === "setup") foot = `<div class="panel-foot"><button class="btn" data-act="openAuction">Open auction to buyers</button><span class="hint">Invites the buyer set to file sealed bids.</span></div>`;
    else if (s.stage === "bidding") foot = `<div class="panel-foot"><button class="btn" data-act="openBook" ${filed ? "" : "disabled"}>Open sealed bid book</button><span class="hint">${filed} of ${d.buyers.length} bids in · opening reveals all and sets the clearing price.</span></div>`;
    else if (open) foot = `<div class="panel-note">Book opened · clearing price <b class="mono" style="color:var(--accent)">${pct(s.clearingPrice)}</b> set by ${esc(S.buyer(s.leadBuyerId).name)} (highest qualifying bid)${s.syndicateIds.length ? ` · syndicate: ${s.syndicateIds.map((i) => esc(S.buyer(i).name)).join(", ")}` : ""}. Disclosed to the room.</div>`;
    return `<div class="section-stack">
      <div class="panel">
        <div class="panel-head"><h2>Sealed bid book</h2><span class="ph-meta">${open ? "Opened" : "Sealed"} · ${filed}/${d.buyers.length} filed</span></div>
        <div class="panel-body flush"><table class="data">
          <thead><tr><th>Buyer</th><th class="num">Bid (% NAV)</th><th class="num">Capacity</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        ${foot}
      </div>
      ${open ? clearingPanel() : `<div class="panel"><div class="panel-head"><h2>Fairness</h2></div><div class="panel-body"><p class="hint" style="margin:0">Bids stay sealed from each other and from LPs until you open the book. The best qualifying bid within the ${pct(d.fairLow)}–${pct(d.fairHigh)} fairness range becomes the disclosed clearing price.</p></div></div>`}
    </div>`;
  }

  function clearingPanel() {
    const s = S.get(), d = S.deal();
    const body = `<dl class="kv">
      <dt>Clearing price</dt><dd><span class="figure">${pct(s.clearingPrice)}</span> of NAV · $${s.clearingPrice.toFixed(2)} per $1.00 NAV</dd>
      <dt>Lead buyer</dt><dd>${esc(S.buyer(s.leadBuyerId).name)} · capacity ${fmtM(C.leadCapacity())}</dd>
      <dt>Syndicate</dt><dd>${s.syndicateIds.length ? s.syndicateIds.map((i) => esc(S.buyer(i).name)).join(", ") + ` · +${fmtM(C.syndicateCapacity())} at clearing price` : "none — lead covers demand"}</dd>
      <dt>Fairness opinion</dt><dd>${esc(d.fairnessProvider)} <span class="mute mono" style="font-size:12px">· validates ${pct(s.clearingPrice)} within ${pct(d.fairLow)}–${pct(d.fairHigh)}</span></dd>
    </dl>`;
    return `<div class="panel"><div class="panel-head"><h2>Clearing price · disclosed to the room</h2><span class="ph-meta"><span class="chip ok">Fairness-validated</span></span></div>
      <div class="panel-body">${body}</div></div>`;
  }

  function buyerBids() {
    const s = S.get(), id = myBuyerId(ROLE), b = S.buyer(id), bid = s.bids[id];
    let mine;
    if (!bid && (s.stage === "setup" || s.stage === "bidding")) {
      mine = `<div class="panel"><div class="panel-head"><h2>Submit your sealed bid</h2></div>
        <div class="panel-body">
          ${s.dealNo > 1 ? `<p class="hint" style="margin:0 0 14px">Eligibility verified — reused from your last deal. One click to bid.</p>` : ""}
          <div class="form-grid">
            <div class="form-row"><label for="bp">Bid — % of NAV</label>
              <div class="input-group"><input class="input" id="bp" type="number" step="0.01" min="${S.deal().fairLow}" max="1" value="${(b.defaultBid).toFixed(2)}"><span class="suffix">of NAV</span></div></div>
            <div class="form-row"><label for="bc">Capacity — NAV you'll absorb</label>
              <div class="input-group"><span class="prefix">$</span><input class="input" id="bc" type="number" step="0.5" min="0" value="${b.defaultCapacity.toFixed(1)}"><span class="suffix">M</span></div></div>
          </div>
        </div>
        <div class="panel-foot"><button class="btn" data-act="submitBid">Submit sealed bid</button><span class="hint">Blind to other buyers. Fairness range ${pct(S.deal().fairLow)}–${pct(S.deal().fairHigh)}.</span></div></div>`;
    } else if (bid) {
      const st = s.bidsOpen ? bidStatusText(id) : "Filed · sealed until the advisor opens the book";
      mine = `<div class="panel"><div class="panel-head"><h2>Your sealed bid</h2><span class="ph-meta">${s.bidsOpen ? (id === s.leadBuyerId ? `<span class="chip ok">Lead</span>` : (s.syndicateIds.includes(id) ? `<span class="chip ok">Syndicate</span>` : `<span class="chip sealed">Outbid</span>`)) : `<span class="chip ok">Filed</span>`}</span></div>
        <div class="panel-body"><dl class="kv">
          <dt>Your bid</dt><dd><span class="figure">${pct(bid.price)}</span> of NAV · $${bid.price.toFixed(2)} per $1.00</dd>
          <dt>Capacity</dt><dd><span class="figure">${fmtM(bid.capacity)}</span> NAV</dd>
          <dt>Status</dt><dd>${esc(st)}</dd>
          ${s.bidsOpen ? `<dt>Clearing price</dt><dd><span class="figure">${pct(s.clearingPrice)}</span> of NAV · disclosed to the room</dd>` : ""}
        </dl></div></div>`;
    } else {
      mine = panel("Your bid", `<p class="hint" style="margin:0">The auction is closed. Clearing price ${s.clearingPrice ? pct(s.clearingPrice) : "—"}.</p>`);
    }
    return `<div class="section-stack">${mine}
      <div class="panel"><div class="panel-head"><h2>Other bidders</h2><span class="ph-meta">${S.deal().buyers.length - 1} buyers</span></div>
        <div class="panel-body"><div class="sealed-row"><span class="lbl">${S.deal().buyers.length - 1} competing bids</span><span class="bars" style="display:inline-block;width:120px;height:12px;background:repeating-linear-gradient(135deg,var(--border-hi),var(--border-hi) 3px,transparent 3px,transparent 6px)"></span><span class="seal-note">•••• sealed</span></div>
        <span class="cant-see" style="margin-top:10px;display:block">You can't see other buyers' bids — and they can't see yours.</span></div></div>
    </div>`;
  }

  // ========================================================== ELECTIONS
  function secElections() {
    if (ROLE === "advisor") return advisorElections();
    if (isLP(ROLE)) return lpElections(myLpId(ROLE));
    return lockedSection();
  }

  function advisorElections() {
    const s = S.get(), d = S.deal();
    const rows = S.roster().map((r) => {
      let st;
      if (!r.filed) st = s.stage === "elections" ? `<span class="chip pending">Awaiting</span>` : `<span class="chip sealed">Not open</span>`;
      else st = `<span class="chip ok">Filed</span>${r.byDefault ? ` <span class="hint">default-sell</span>` : ""}`;
      return `<tr><td class="nm">${esc(r.name)}<span class="sub">${esc(r.type)}</span></td>
        <td class="num">${fmtM(r.nav)}</td>
        <td>${st}</td></tr>`;
    }).join("");
    const filed = C.electionsFiledCount();
    let foot = "";
    if (s.stage === "cleared") foot = `<div class="panel-foot"><button class="btn" data-act="openElections">Open elections to LPs</button><span class="hint">LPs elect roll or sell at the ${pct(s.clearingPrice)} clearing price.</span></div>`;
    else if (s.stage === "elections") foot = `<div class="panel-foot"><button class="btn" data-act="compute">Close elections & compute allocation</button><span class="hint">${filed} of ${d.lps.length} filed · unfiled LPs default to sell.</span></div>`;
    else foot = `<div class="panel-note">Elections closed · ${filed} of ${d.lps.length} filed.</div>`;
    return `<div class="section-stack">
      <div class="panel"><div class="panel-head"><h2>Election status</h2><span class="ph-meta">${filed}/${d.lps.length} filed</span></div>
        <div class="panel-body flush"><table class="data">
          <thead><tr><th>Investor</th><th class="num">NAV</th><th>Election</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        ${foot}</div>
      <div class="panel"><div class="panel-head"><h2>Privacy</h2></div><div class="panel-body"><p class="hint" style="margin:0">You see only that an election is <b>filed</b> — never whether an LP rolled or sold, and never the amount. Contents stay sealed from you until the atomic close.</p></div></div>
    </div>`;
  }

  function lpElections(id) {
    const s = S.get(), l = S.lp(id), d = S.deal(), e = s.elections[id];
    if (s.stage === "setup" || s.stage === "bidding" || s.stage === "cleared") {
      return `<div class="section-stack">${panel("Elections", `<p class="hint" style="margin:0">Elections open once the auction clears and the advisor releases the clearing price. ${s.clearingPrice ? `Clearing price ${pct(s.clearingPrice)} — opening shortly.` : "Auction still in progress."}</p>`)}${lpPeerElections(id)}</div>`;
    }
    const draftRoll = e ? e.rollNav : l.nav;
    const choice = e ? e.choice : "roll";
    const open = s.stage === "elections";
    const form = open ? `<div class="panel"><div class="panel-head"><h2>${e ? "Amend your election" : "File your election"}</h2><span class="ph-meta">at ${pct(s.clearingPrice)} clearing price</span></div>
      <div class="panel-body">
        <div class="choice-row" id="elchoice" style="margin-bottom:16px">
          <button class="choice" type="button" data-choice="roll" aria-pressed="${choice === "roll"}"><span class="ct">Roll over</span><span class="cd">Keep ${fmtM(l.nav)} NAV in ${esc(d.vehicleShort)}</span></button>
          <button class="choice" type="button" data-choice="sell" aria-pressed="${choice === "sell"}"><span class="ct">Sell</span><span class="cd">Cash out ${fmtM(l.nav)} at ${pct(s.clearingPrice)}</span></button>
        </div>
        <div class="choice-row" style="grid-template-columns:1fr;margin-bottom:16px">
          <button class="choice" type="button" data-choice="split" aria-pressed="${choice === "split"}"><span class="ct">Split — roll some, sell some</span><span class="cd">Set how much of ${fmtM(l.nav)} NAV to roll</span></button>
        </div>
        <div class="form-row" id="splitrow" style="${choice === "split" ? "" : "display:none"}">
          <label for="rollamt">Roll amount — remainder sells at ${pct(s.clearingPrice)}</label>
          <div class="input-group"><span class="prefix">$</span><input class="input" id="rollamt" type="number" step="0.1" min="0" max="${l.nav}" value="${draftRoll.toFixed(1)}"><span class="suffix">M of ${fmtM(l.nav)}</span></div>
        </div>
      </div>
      <div class="panel-foot"><button class="btn" data-act="submitElection">${e ? "Amend election" : "File election"}</button><span class="hint">Private from other LPs. Amend until ${esc(d.electionDeadline)}. No choice by then defaults to sell.</span></div></div>` : "";
    const filed = e ? panel("Your filed election", `<dl class="kv"><dt>Choice</dt><dd>${electionSummary(e)}</dd><dt>At clearing price</dt><dd><span class="figure">${pct(s.clearingPrice)}</span> of NAV</dd>${e.sellNav > 0 ? `<dt>Cash you'll receive</dt><dd><span class="figure">${fmtM(+(e.sellNav * s.clearingPrice).toFixed(3))}</span> USDC</dd>` : ""}${e.rollNav > 0 ? `<dt>Units you'll hold</dt><dd><span class="figure">${fmtUnits(e.rollNav / d.navPerUnit)}</span> in ${esc(d.vehicleShort)}</dd>` : ""}</dl>`, null, `<span class="chip ok">Filed</span>`) : "";
    return `<div class="section-stack">${form}${e && open ? filed : (e ? filed : "")}${lpPeerElections(id)}</div>`;
  }

  function lpPeerElections(id) {
    const d = S.deal(), s = S.get();
    const peers = d.lps.filter((l) => l.id !== id);
    const filedN = peers.filter((l) => C.electionFor(l.id)).length;
    const rows = peers.map((l) => `<tr><td class="nm">${esc(l.name)}<span class="sub">${esc(l.type)}</span></td>
      <td>${C.electionFor(l.id) ? `<span class="chip ok">Filed</span>` : `<span class="chip pending">Awaiting</span>`}</td>
      <td><span class="cell-sealed"><span class="bars" aria-hidden="true"></span>sealed</span></td></tr>`).join("");
    return `<div class="panel"><div class="panel-head"><h2>Other investors</h2><span class="ph-meta">${filedN}/${peers.length} filed</span></div>
      <div class="panel-body flush"><table class="data"><thead><tr><th>Investor</th><th>Status</th><th>Their choice</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="panel-note">You can see that peers have filed — never what they chose. Your choice is sealed from them too.</div></div>`;
  }

  // ========================================================== ALLOCATION
  function secAllocation() {
    const s = S.get();
    if (!s.allocation) {
      return panel("Allocation", `<p class="hint" style="margin:0">The allocation is computed once elections close. ${s.stage === "elections" ? "Elections are still open." : "Not yet at this stage."}</p>`);
    }
    const myLegs = S.legsFor(ROLE);
    const showAll = ROLE === "advisor" || (ROLE === "oversight" && s.closed);
    const stack = [];
    if (ROLE === "advisor") stack.push(allocationSummary());
    stack.push(legsTable(showAll ? S.legs() : myLegs, showAll));
    if (showAll) stack.push(tieOutCallout());
    if (ROLE === "advisor" && s.stage === "allocation") stack.push(`<div class="panel"><div class="panel-foot"><button class="btn" data-act="sendForApproval">Send for per-leg approval</button><span class="hint">Each party then authorizes only its own leg before the atomic close.</span></div></div>`);
    return `<div class="section-stack">${stack.join("")}</div>`;
  }

  function allocationSummary() {
    const s = S.get(), d = S.deal();
    const over = C.oversubscribed();
    const cells = [
      ["Sell demand", fmtM(C.sellDemand()), `${S.roster().filter((r) => r.sellNav > 0).length} sellers`, ""],
      ["Roll demand", fmtM(C.rollDemand()), `${S.roster().filter((r) => r.rollNav > 0).length} rollers`, ""],
      ["Buyer capacity", fmtM(C.buyerCapacity()), `lead ${fmtM(C.leadCapacity())} + syndicate ${fmtM(C.syndicateCapacity())}`, ""],
      ["Cash to settle", fmtM(C.cashTotal()), `${fmtM(C.filledSellNav())} NAV × ${pct(s.clearingPrice)}`, "accent"],
    ];
    const backstop = over
      ? `<div class="panel-note" style="color:var(--warn)">Sell demand exceeds buyer capacity — each seller filled <b>pro-rata</b> at ${pct(C.fillRatio())} of their order; the remainder rolls forward.</div>`
      : (s.syndicateIds.length ? `<div class="panel-note">Sell demand above the lead's ${fmtM(C.leadCapacity())} is backstopped by the syndicate (${s.syndicateIds.map((i) => esc(S.buyer(i).name)).join(", ")}) at the clearing price.</div>` : "");
    return `<div class="panel"><div class="panel-head"><h2>Allocation · sized at ${pct(s.clearingPrice)}</h2></div>
      <div class="metrics" style="border:0">${cells.map((c) => `<div class="mc"><span class="m-lab">${c[0]}</span><span class="m-val ${c[3]}">${c[1]}</span><span class="m-note">${c[2]}</span></div>`).join("")}</div>
      ${backstop}</div>`;
  }

  function legsTable(legs, all) {
    if (!legs.length) return panel("Your legs", `<p class="hint" style="margin:0">No settlement leg binds you in this deal.</p>`);
    const rows = legs.map((l) => `<tr><td class="num" style="color:var(--mute)">${l.n}</td>
      <td class="nm">${esc(l.label)}<span class="sub">${esc(l.sub)}</span></td>
      <td>${esc(l.from)} → ${esc(l.to)}</td>
      <td><span class="chip sealed">${kindLabel(l.kind)}</span></td></tr>`).join("");
    return `<div class="panel"><div class="panel-head"><h2>${all ? "Settlement legs" : "Your settlement legs"}</h2><span class="ph-meta">${legs.length} leg${legs.length > 1 ? "s" : ""}</span></div>
      <div class="panel-body flush"><table class="data">
        <thead><tr><th class="num">#</th><th>Leg</th><th>From → To</th><th>Type</th></tr></thead>
        <tbody>${rows}</tbody></table></div></div>`;
  }
  function kindLabel(k) { return { cash: "Cash · USDC", units: "CV units", asset: "Asset" }[k] || k; }

  function tieOutCallout() {
    return `<div class="callout"><div class="ct">Tie-out · sum in = sum out</div>
      <p>Units issued <span class="mono">${fmtUnits(C.unitsIssued())}</span> = asset NAV transferred in <span class="mono">${fmtM(C.assetNavIn())}</span>. Cash out to sellers <span class="mono">${fmtM(C.cashTotal())}</span> = cash in from buyers <span class="mono">${fmtM(C.cashTotal())}</span>.</p></div>`;
  }

  // ========================================================== SETTLEMENT
  function secSettlement() {
    const s = S.get();
    if (s.closed || (s.stage === "settled" && s.failedAttempt)) return settlementResult();
    if (s.stage === "settlement") return settlingView();
    if (s.stage !== "approvals") return panel("Settlement", `<p class="hint" style="margin:0">Settlement opens after the allocation is sent for approval.</p>`);
    return approvalsView();
  }

  function approvalsView() {
    const s = S.get();
    const mineKey = S.approvalKeyFor(ROLE);
    const parties = S.approvalParties();
    const rows = parties.map((p) => {
      const ok = s.approvals[p.key];
      const mine = p.key === mineKey;
      return `<tr class="${mine ? "me" : ""}"><td class="nm">${esc(p.who)}${mine ? `<span class="you-tag">You</span>` : ""}<span class="sub">${esc(p.obl)}</span></td>
        <td>${ok ? `<span class="chip ok">Authorized</span>` : `<span class="chip pending">Pending</span>`}</td>
        <td style="text-align:right">${mine && !ok ? `<button class="btn" data-act="approve" data-key="${esc(p.key)}">Authorize my leg</button>` : (mine && ok ? `<button class="btn ghost" data-act="cancel" data-key="${esc(p.key)}">Withdraw</button>` : "")}</td></tr>`;
    }).join("");
    const pending = S.approvalsPending();
    let foot = "";
    if (ROLE === "advisor") {
      foot = `<div class="panel-foot">
        <button class="btn big" data-act="settle" ${S.allApproved() ? "" : "disabled"}>Settle atomically</button>
        <label class="fail-toggle"><input type="checkbox" id="failtoggle"> Force a leg to fail (test rollback)</label>
        <span class="hint">${S.allApproved() ? "All legs authorized — one action moves everything, or nothing." : `${pending} approval(s) outstanding.`}</span></div>`;
    }
    return `<div class="section-stack">
      <div class="panel"><div class="panel-head"><h2>Per-leg approvals</h2><span class="ph-meta">${parties.length - pending}/${parties.length} authorized</span></div>
        <div class="panel-body flush"><table class="data">
          <thead><tr><th>Party</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        ${foot}</div>
      ${legsTable(ROLE === "advisor" ? S.legs() : S.legsFor(ROLE), ROLE === "advisor")}
    </div>`;
  }

  function settlingView() {
    return `<div class="section-stack">
      <div class="panel"><div class="panel-head"><h2>Settling — atomic</h2><span class="ph-meta"><span class="chip pending">In progress</span></span></div>
        <div class="panel-body flush">${legsAnimated(ROLE === "advisor" ? S.legs() : S.legsFor(ROLE))}</div></div></div>`;
  }

  function legsAnimated(legs) {
    return `<div class="legs">${legs.map((l) => `
      <div class="leg" data-leg="${l.n}"><span class="sweep" aria-hidden="true"></span>
        <span class="ln">${l.n}</span>
        <span class="desc"><span class="d-main"><span class="figure">${esc(l.label)}</span></span><span class="d-sub">${esc(l.sub)}</span></span>
        <span class="st">Pending</span></div>`).join("")}</div>`;
  }

  function settlementResult() {
    const s = S.get();
    if (s.failedAttempt) {
      return `<div class="section-stack">
        <div class="panel fail" style="border-color:color-mix(in oklch,var(--fail) 55%,transparent)">
          <div class="panel-head" style="background:var(--fail-soft)"><h2 style="color:var(--fail)">Settlement reverted</h2></div>
          <div class="panel-body"><p style="margin:0 0 6px">One leg failed, so the whole transaction rolled back. <b>Nothing moved</b> — no cash, no units, no asset. Every party is exactly where it started.</p></div>
          <div class="panel-foot"><button class="btn" data-act="retry">Retry the close</button><span class="hint">Atomicity: all legs settle together or none do.</span></div>
        </div>
        <div class="panel"><div class="panel-head"><h2>Legs (rolled back)</h2></div><div class="panel-body flush">${legsTable(ROLE === "advisor" ? S.legs() : S.legsFor(ROLE), ROLE === "advisor").replace(/^<div class="panel">|<\/div>$/g, "")}</div></div>
      </div>`;
    }
    return `<div class="section-stack">${receipt()}${legsSettled(ROLE === "advisor" ? S.legs() : S.legsFor(ROLE))}</div>`;
  }

  function receipt() {
    const s = S.get(), d = S.deal();
    const when = s.closedAt ? new Date(s.closedAt) : null;
    const whenTxt = when ? when.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
    const settleId = "STL-" + d.id + "-" + (s.closedAt ? s.closedAt.slice(0, 10).replace(/-/g, "") : "");
    return `<div class="receipt">
      <div class="rc-head"><span class="rc-check" aria-hidden="true"></span>
        <div><div class="rc-title">Settled atomically</div><div class="rc-sub">${S.legs().length} legs · one transaction · T+0 · no partial settlement possible</div></div></div>
      <div class="rc-meta">
        <div class="rcm"><span class="l">Settlement ID</span><span class="v accent">${esc(settleId)}</span></div>
        <div class="rcm"><span class="l">Timestamp</span><span class="v">${esc(whenTxt)}</span></div>
        <div class="rcm"><span class="l">Value date</span><span class="v">T+0 · same day</span></div>
        <div class="rcm"><span class="l">Clearing price</span><span class="v accent">${pct(s.clearingPrice)} of NAV</span></div>
        <div class="rcm"><span class="l">Cash settled</span><span class="v">${fmtM(C.cashTotal())} USDC</span></div>
        <div class="rcm"><span class="l">Units issued</span><span class="v">${fmtUnits(C.unitsIssued())}</span></div>
      </div>
      <div class="panel-foot"><button class="btn ghost" data-act="download">Download confirmation</button>${S.get().dealNo === 1 ? `<button class="btn" data-next>Start next deal — Brightwater CV I</button>` : ""}<span class="hint">${ROLE === "buyer" ? "Your eligibility stays verified for the next deal." : "Confidential — scoped to your legs."}</span></div>
    </div>`;
  }

  function legsSettled(legs) {
    const rows = legs.map((l) => `<tr><td class="num" style="color:var(--mute)">${l.n}</td>
      <td class="nm">${esc(l.label)}<span class="sub">${esc(l.sub)}</span></td>
      <td>${esc(l.from)} → ${esc(l.to)}</td>
      <td><span class="chip ok">Settled</span></td></tr>`).join("");
    return `<div class="panel"><div class="panel-head"><h2>${ROLE === "advisor" ? "Settled legs" : "Your settled legs"}</h2><span class="ph-meta">${legs.length} · T+0</span></div>
      <div class="panel-body flush"><table class="data"><thead><tr><th class="num">#</th><th>Leg</th><th>From → To</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // ========================================================== DOCUMENTS
  function secDocuments() {
    const d = S.deal();
    const rows = d.docs.map((doc) => `<tr><td class="nm">${esc(doc.name)}<span class="sub">${esc(doc.type)}</span></td>
      <td>${esc(doc.owner)}</td>
      <td><span class="chip ${doc.status === "Open" || doc.status === "Draft" ? "pending" : "ok"}">${esc(doc.status)}</span></td>
      <td style="text-align:right"><button class="btn ghost" data-act="doc" data-doc="${esc(doc.name)}">Open</button></td></tr>`).join("");
    return `<div class="panel"><div class="panel-head"><h2>Document index</h2><span class="ph-meta">${d.docs.length} documents</span></div>
      <div class="panel-body flush"><table class="data"><thead><tr><th>Document</th><th>Owner</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="panel-note">Documents are scoped to your role. Counterparty-private files don't appear here.</div></div>`;
  }

  // ========================================================== AUDIT
  function secAudit() {
    const s = S.get();
    const stack = [];
    if (ROLE === "oversight" && s.closed) stack.push(fairnessAttestations());
    stack.push(activityPanel(50));
    return `<div class="section-stack">${stack.join("")}</div>`;
  }

  function activityPanel(limit) {
    const s = S.get();
    const events = s.audit.slice().sort((a, b) => a.order - b.order).slice(-limit).reverse();
    const rows = events.map((e) => {
      const t = e.t ? new Date(e.t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "seed";
      return `<tr><td class="num" style="color:var(--mute);font-size:12px">${esc(t)}</td><td>${esc(e.actor)}</td><td>${esc(e.event)}</td></tr>`;
    }).join("");
    return `<div class="panel"><div class="panel-head"><h2>Activity log</h2><span class="ph-meta">${events.length} events</span></div>
      <div class="panel-body flush"><table class="data"><thead><tr><th>Time</th><th>Actor</th><th>Event</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  function fairnessAttestations() {
    const s = S.get(), d = S.deal();
    return `<div class="panel"><div class="panel-head"><h2>Fairness attestations</h2><span class="ph-meta"><span class="chip ok">Verified post-close</span></span></div>
      <div class="panel-body flush"><ul class="attest">
        <li><span class="ck" aria-hidden="true"></span><div>Price set by sealed-bid auction before any election<small>Clearing ${pct(s.clearingPrice)} = best qualifying bid · within ${pct(d.fairLow)}–${pct(d.fairHigh)} · ${esc(d.fairnessProvider)} opinion on file</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Buyers bid blind to one another<small>${d.buyers.length} buyers · each saw only its own bid until the book opened</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Each LP's election stayed private from other LPs<small>${d.lps.length} LPs elected peer-private; advisor saw only "filed" markers</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>GP conflict disclosed<small>GP rolls ${esc(d.gpCommit)} into ${esc(d.vehicleShort)} · disclosed to the LPAC</small></div></li>
        <li><span class="ck" aria-hidden="true"></span><div>Settled in one atomic transaction<small>${S.legs().length} legs · T+0 · forced-failure test rolled everything back, nothing moved</small></div></li>
      </ul></div></div>`;
  }

  // ---- shared panel helper ---------------------------------------------------
  function panel(title, bodyHtml, footHtml, meta) {
    return `<div class="panel"><div class="panel-head"><h2>${esc(title)}</h2>${meta ? `<span class="ph-meta">${meta}</span>` : ""}</div>
      <div class="panel-body">${bodyHtml}</div>${footHtml || ""}</div>`;
  }

  // ========================================================== wiring
  function wire(root, parts) {
    // navigation
    root.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => location.hash = "#/" + DEAL_HASH()));
    root.querySelectorAll("[data-next]").forEach((b) => b.addEventListener("click", () => { const n = S.actions.startNextDeal(); if (n) { toast("Deal 02 opened — Northbeam credential reused."); location.hash = "#/" + DEAL_HASH(); } }));
    root.querySelectorAll("[data-go]").forEach((b) => b.addEventListener("click", () => location.hash = "#/" + DEAL_HASH() + "/" + b.getAttribute("data-go")));

    // election choice toggles
    const choiceRow = root.querySelector("#elchoice");
    if (choiceRow) {
      root.querySelectorAll("[data-choice]").forEach((b) => b.addEventListener("click", () => {
        root.querySelectorAll("[data-choice]").forEach((x) => x.setAttribute("aria-pressed", "false"));
        b.setAttribute("aria-pressed", "true");
        const split = root.querySelector("#splitrow");
        if (split) split.style.display = b.getAttribute("data-choice") === "split" ? "" : "none";
      }));
    }

    // actions
    root.querySelectorAll("[data-act]").forEach((el) => el.addEventListener("click", () => handleAct(el, root)));
  }

  // inline field validation — specific message tied to the input via
  // aria-describedby, focus returned to the field, announced via the toast (aria-live).
  function fieldOk(root, sel, valid, message) {
    const input = root.querySelector(sel);
    if (!input) return valid;
    const errId = sel.slice(1) + "-err";
    let err = root.querySelector("#" + errId);
    if (valid) {
      input.removeAttribute("aria-invalid"); input.removeAttribute("aria-describedby");
      if (err) err.remove();
      return true;
    }
    if (!err) {
      err = document.createElement("p");
      err.id = errId; err.className = "field-err"; err.setAttribute("role", "alert");
      input.closest(".form-row").appendChild(err);
    }
    err.textContent = message;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", errId);
    input.focus();
    toast(message, "fail");
    return false;
  }

  function selectedChoice(root) {
    const b = root.querySelector('[data-choice][aria-pressed="true"]');
    return b ? b.getAttribute("data-choice") : "roll";
  }

  function handleAct(el, root) {
    const act = el.getAttribute("data-act");
    switch (act) {
      case "openAuction": S.actions.openAuction(); toast("Auction opened to buyers."); break;
      case "openBook": S.actions.openBook(); toast("Bid book opened — clearing price disclosed."); break;
      case "submitBid": {
        const d = S.deal();
        const price = parseFloat(root.querySelector("#bp").value);
        const capacity = parseFloat(root.querySelector("#bc").value);
        if (!fieldOk(root, "#bp", Number.isFinite(price) && price >= d.fairLow && price <= 1, `Bid must be ${pct(d.fairLow)}–100% of NAV.`)) break;
        if (!fieldOk(root, "#bc", Number.isFinite(capacity) && capacity > 0, "Capacity must be a positive NAV amount.")) break;
        S.actions.submitBid({ buyerId: myBuyerId(ROLE), price, capacity });
        toast("Sealed bid submitted — blind to other buyers."); break;
      }
      case "openElections": S.actions.openElections(); toast("Elections opened to LPs."); break;
      case "submitElection": {
        const choice = selectedChoice(root);
        let rollNav;
        if (choice === "split") {
          const l = S.lp(myLpId(ROLE));
          rollNav = parseFloat((root.querySelector("#rollamt") || {}).value);
          if (!fieldOk(root, "#rollamt", Number.isFinite(rollNav) && rollNav >= 0 && rollNav <= l.nav, `Roll amount must be $0–${fmtM(l.nav)}.`)) break;
        }
        S.actions.submitElection({ lpId: myLpId(ROLE), choice, rollNav });
        toast("Election filed — sealed from other LPs."); break;
      }
      case "compute": S.actions.closeElectionsAndCompute(); toast("Allocation computed — legs tie out."); break;
      case "sendForApproval": S.actions.sendForApproval(); toast("Sent to parties for per-leg approval."); break;
      case "approve": S.actions.approve({ key: el.getAttribute("data-key") }); toast("Your leg authorized."); break;
      case "cancel": S.actions.cancelApproval({ key: el.getAttribute("data-key") }); toast("Authorization withdrawn."); break;
      case "settle": {
        const fail = !!(root.querySelector("#failtoggle") && root.querySelector("#failtoggle").checked);
        S.fireClose(fail); toast(fail ? "Forcing a leg to fail…" : "Settling atomically…", fail ? "fail" : ""); break;
      }
      case "retry": S.actions.retryClose(); toast("Ready to retry the close."); break;
      case "download": toast("Confirmation downloaded (simulated)."); break;
      case "doc": toast("Opening " + el.getAttribute("data-doc") + " (simulated)."); break;
    }
  }

  // ---- toast -----------------------------------------------------------------
  function toast(msg, kind = "") {
    const t = document.getElementById("ct-toast");
    if (!t) return;
    t.textContent = msg; t.className = "toast show" + (kind ? " " + kind : "");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = "toast" + (kind ? " " + kind : ""); }, 3000);
  }

  // ---- atomic close animation ------------------------------------------------
  function animateClose(fail) {
    const els = Array.from(document.querySelectorAll(".leg"));
    if (!els.length) return;
    if (els[0].dataset.animating) return;
    els.forEach((e) => e.dataset.animating = "1");
    const step = reduced() ? 0 : M.CLOSE_MS.step;
    if (fail) {
      els.forEach((el, i) => setTimeout(() => el.classList.add("filling"), i * step));
      const at = els.length * step + 250;
      setTimeout(() => els.forEach((el) => { el.classList.remove("filling"); el.classList.add("failing"); setSt(el, "Failed"); }), at);
      setTimeout(() => els.forEach((el) => { el.classList.remove("failing"); el.classList.add("reverted"); setSt(el, "Reverted"); }), at + 450);
    } else {
      els.forEach((el, i) => setTimeout(() => { el.classList.add("filling"); setTimeout(() => { el.classList.add("settled"); setSt(el, "Settled"); }, step); }, i * step));
    }
  }
  function setSt(el, txt) { const st = el.querySelector(".st"); if (st) st.textContent = txt; }

  return { run: boot };
})();
