// Application shell — the one frame every signed-in seat lives in.
//
//   ┌ sidebar ──────────┬ page header (title · status · contextual side) ┐
//   │ brand             ├────────────────────────────────────────────────┤
//   │ deal context      │ content (full width, consistent gutters)       │
//   │ section nav       │                                                │
//   │ identity + trust  │                                                │
//   └───────────────────┴────────────────────────────────────────────────┘
//
// The nav is a WAI-ARIA vertical tablist (arrow keys move, roving tabindex), so a
// page's sections keep tab semantics whether they render as sidebar items here or
// as an in-page tab row elsewhere. The sidebar footer carries the SIGNING identity
// (the custodian holds this seat's key — the browser holds none), the trust-model
// dialog, and sign-out. Everything else on screen belongs to the page.
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useSession } from '../state/WalletSession';
import TrustPanel from '../views/TrustPanel';
import { AVATAR } from '../lib/avatars';
import logo from '../assets/logo.svg';

export type ShellNavItem = { id: string; label: string; badge?: number };

function TrustDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog" role="dialog" aria-modal="true" aria-label="Trust model">
        <button type="button" className="settled-close" aria-label="Close" onClick={onClose}>
          <X size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <h2>How authorization works</h2>
        <TrustPanel />
        <div className="actions">
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Shell({
  nav,
  current,
  onNav,
  navLabel = 'Sections',
  title,
  eyebrow,
  subtitle,
  headSide,
  status,
  children,
}: {
  nav: ShellNavItem[];
  current: string;
  onNav: (id: string) => void;
  navLabel?: string;
  /** Page header title — the deal, in serif. Rendered exactly once. */
  title: ReactNode;
  eyebrow?: string;
  subtitle?: ReactNode;
  /** Right side of the page header (compact stepper, status chips). */
  headSide?: ReactNode;
  /** Deal status shown in the sidebar context block. */
  status?: ReactNode;
  children: ReactNode;
}) {
  const { role, custodianName, signOut } = useSession();
  const [trustOpen, setTrustOpen] = useState(false);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const move = (from: number, delta: number) => {
    const n = nav.length;
    const next = (from + delta + n) % n;
    onNav(nav[next].id);
    refs.current[next]?.focus();
  };
  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault();
      move(i, 1);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault();
      move(i, -1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onNav(nav[0].id);
      refs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      onNav(nav[nav.length - 1].id);
      refs.current[nav.length - 1]?.focus();
    }
  };


  return (
    <div className="appshell">
      <a className="skip-link" href="#page-content">
        Skip to content
      </a>
      <aside className="sidebar">
        <div className="side-brand">
          <img className="logo" src={logo} alt="Continuum" />
        </div>

        <div className="side-deal">
          <span className="sd-eyebrow">GP-led continuation vehicle</span>
          <span className="sd-name">Meridian Growth Fund III → CV</span>
          {/* Always rendered: the chip arrives with the first ledger read, and an
              appearing element here would shove the whole nav down (visible jump).
              Empty state shows a quiet skeleton pill instead. */}
          <span className="sd-status">{status}</span>
        </div>

        <nav className="side-nav" role="tablist" aria-orientation="vertical" aria-label={navLabel}>
          <span className="side-sec">{navLabel}</span>
          {nav.map((t, i) => {
            const selected = t.id === current;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  refs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={selected}
                aria-controls={`panel-${t.id}`}
                tabIndex={selected ? 0 : -1}
                className={`side-link${selected ? ' current' : ''}`}
                onClick={() => onNav(t.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
              >
                {t.label}
                {t.badge ? <span className="count">{t.badge}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="side-foot">
          <div className="identity" title="Signing custodian — holds this seat's key; the browser holds none">
            <span className="id-avatar" aria-hidden="true">
              {role ? <img src={AVATAR[role]} alt="" /> : null}
            </span>
            <span className="id-meta">
              <span className="id-name">{custodianName ?? '—'}</span>
              <span className="id-role">Signing custodian · {role ?? ''}</span>
            </span>
          </div>
          <div className="side-foot-actions">
            <button type="button" className="btn ghost sm" onClick={() => setTrustOpen(true)}>
              Trust model
            </button>
            <button type="button" className="btn ghost sm" onClick={signOut}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="appmain">
        <header className="page-head">
          <div className="ph-titles">
            {eyebrow ? <span className="ph-eyebrow">{eyebrow}</span> : null}
            <h1>{title}</h1>
            {subtitle ? <span className="ph-sub">{subtitle}</span> : null}
          </div>
          {headSide ? <div className="ph-side">{headSide}</div> : null}
        </header>
        <main className="appbody" id="page-content">
          {children}
        </main>
      </div>

      {trustOpen ? <TrustDialog onClose={() => setTrustOpen(false)} /> : null}
    </div>
  );
}
