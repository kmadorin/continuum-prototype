// Role workspace shell — wraps each persona view with a section sub-nav:
//   Deal · Approvals · Audit
// The Deal tab is the role's existing workspace (passed as children). Approvals is
// the four-eyes queue (badge = live count of items awaiting this party's signature).
// Audit is the custody signature trail. The Ledger Inspector is a global drawer
// (mounted in App via InspectorProvider), opened from toast/audit update ids.
//
// The queue count polls this party's own ACS — event-driven, no client-side shared
// queue. Keeps the portal design classes (.subnav, .section, .count).
import { useState } from 'react';
import type { ReactNode } from 'react';
import ApprovalQueue, { usePendingApprovals } from './ApprovalQueue';
import AuditTrail from './AuditTrail';

type Tab = 'deal' | 'approvals' | 'audit';

export default function RoleWorkspace({ children }: { children: ReactNode }) {
  const [tab, setTab] = useState<Tab>('deal');
  const { items } = usePendingApprovals();
  const count = items.length;

  const link = (id: Tab, label: string, badge?: number) => (
    <a
      href={`#${id}`}
      className={tab === id ? 'current' : undefined}
      onClick={(e) => {
        e.preventDefault();
        setTab(id);
      }}
    >
      {label}
      {badge ? <span className="count">{badge}</span> : null}
    </a>
  );

  return (
    <div className="stack g4">
      <nav className="subnav" aria-label="Workspace sections">
        {link('deal', 'Deal')}
        {link('approvals', 'Approvals', count)}
        {link('audit', 'Audit')}
      </nav>

      <div className="section">
        {tab === 'deal' && children}
        {tab === 'approvals' && <ApprovalQueue />}
        {tab === 'audit' && <AuditTrail />}
      </div>
    </div>
  );
}
