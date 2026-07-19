// Minimal path router (no react-router). The URL path is the source of truth for
// the seat: `/` is the landing picker, `/<role>` is that role's workspace. pushState
// doesn't fire popstate, so navigate() dispatches its own event; usePath() subscribes
// to both so Back/Forward and programmatic navigation all re-render.
import { useSyncExternalStore } from 'react';

const NAV_EVENT = 'continuum-nav';

export function navigate(path: string, opts?: { replace?: boolean }): void {
  if (window.location.pathname !== path) {
    if (opts?.replace) window.history.replaceState(null, '', path);
    else window.history.pushState(null, '', path);
  }
  window.dispatchEvent(new Event(NAV_EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener('popstate', cb);
  window.addEventListener(NAV_EVENT, cb);
  return () => {
    window.removeEventListener('popstate', cb);
    window.removeEventListener(NAV_EVENT, cb);
  };
};

export function usePath(): string {
  return useSyncExternalStore(subscribe, () => window.location.pathname);
}
