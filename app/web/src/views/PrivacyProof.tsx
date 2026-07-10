// The money shot: render the SAME ledger moment as seen by three (or more)
// different parties, side by side, from live activeContracts(party) reads.
// This is not staged — MockLedgerClient's per-party projection filter
// (stakeholders.includes(party)) is the same filter the real Canton
// projection applies, so a contract present in one column and absent from
// its peers is the actual privacy property, not a mocked-up illustration.
import { useEffect, useState } from 'react';
import type { ActiveContract, LedgerClient } from '../../../ledger-client/src/types';
import { StageHead } from './shared';

function templateName(templateId: string): string {
  return templateId.split(':').pop() ?? templateId;
}

export function PrivacyProof({
  client,
  parties,
}: {
  client: LedgerClient;
  parties: Record<string, string>;
}) {
  const [acs, setAcs] = useState<Record<string, ActiveContract[]>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const out: Record<string, ActiveContract[]> = {};
      for (const [key, party] of Object.entries(parties)) {
        out[key] = await client.activeContracts(party);
      }
      if (alive) setAcs(out);
    })();
    return () => {
      alive = false;
    };
    // Key on a stable string, not the `parties` object identity: a caller that
    // passes an inline object literal would otherwise re-fire this effect every
    // render (setAcs → re-render → new literal → loop). App memoizes personas,
    // but this keeps the component safe for any caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, JSON.stringify(parties)]);

  return (
    <div className="stack g4">
      <StageHead
        tag="PRIVACY PROOF"
        role="Cross-party"
        title="The same moment, seen differently by every party"
        lede="Each column is a live activeContracts() read for that party — no staging, no redaction. What's sealed to one party is simply never in another party's projection."
      />
      <div className="privacy-grid">
        {Object.entries(parties).map(([key, party]) => {
          const contracts = acs[key] ?? [];
          return (
            <div key={key} className="privacy-col card" data-testid={`acs-${key}`}>
              <h3>
                {key} <span className="mute mono">sees</span>
              </h3>
              <p className="mono mute privacy-party">{party}</p>
              {contracts.length === 0 ? (
                <p className="hint">Nothing here — nothing private to see in this column.</p>
              ) : (
                <ul className="privacy-list">
                  {contracts.map((c) => (
                    <li key={c.contractId} className="mono">
                      {templateName(c.templateId)}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
