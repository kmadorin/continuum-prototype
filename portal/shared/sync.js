/* Continuum Portal — shared/sync.js
 * ---------------------------------------------------------------------------
 * The ONLY module that touches persistence. Wraps localStorage (one deal key,
 * same shape as the original prototype so behaviour carries over) plus a
 * BroadcastChannel for live cross-tab sync. Knows nothing about deal logic.
 *
 * Interface (window.CT.sync):
 *   read()             -> parsed shared state, or null
 *   write(state)       -> persist + broadcast to other tabs
 *   subscribe(fn)      -> fn(state) called when ANOTHER tab changes the deal
 *   session.get/set/clear  -> per-tab session role (sessionStorage)
 * ------------------------------------------------------------------------- */
"use strict";
window.CT = window.CT || {};

CT.sync = (function () {
  // Bumped key namespace for the portal build; same structural shape as v4.
  const SHARED_KEY  = "continuum.shared.v4";
  const SESSION_KEY = "continuum.session.role";

  const bc = ("BroadcastChannel" in window) ? new BroadcastChannel("continuum") : null;
  const subscribers = [];

  function read() {
    try {
      const raw = localStorage.getItem(SHARED_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function write(state) {
    try { localStorage.setItem(SHARED_KEY, JSON.stringify(state)); } catch (e) {}
    if (bc) { try { bc.postMessage(state); } catch (e) {} }
  }

  function subscribe(fn) { subscribers.push(fn); }
  function emit(state) { subscribers.forEach((fn) => { try { fn(state); } catch (e) {} }); }

  // inbound changes from other tabs — both transports, deduped by the caller's
  // validator. We don't validate shape here; state.js owns that.
  if (bc) bc.onmessage = (e) => { if (e && e.data) emit(e.data); };
  window.addEventListener("storage", (e) => {
    if (e.key === SHARED_KEY && e.newValue) {
      try { emit(JSON.parse(e.newValue)); } catch (err) {}
    }
  });

  const session = {
    get() { try { return sessionStorage.getItem(SESSION_KEY); } catch (e) { return null; } },
    set(role) { try { sessionStorage.setItem(SESSION_KEY, role); } catch (e) {} },
    clear() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} },
  };

  return { read, write, subscribe, session, SHARED_KEY };
})();
