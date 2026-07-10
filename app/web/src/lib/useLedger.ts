// Custody seam: every persona view drives its OWN on-ledger actions, but signing
// now happens in the CUSTODY BACKEND, not the browser. `submit(commands)` POSTs to
// `/action`; the backend signs with the SESSION party's key (chosen from the
// httpOnly cookie — the client cannot pick a party) and returns `{updateId}`.
// Reads go through the backend's per-party proxy (`HttpLedgerClient('/api')`, which
// forces the session party's projection). Party ids come from the PUBLIC `/registry`.
//
// SECURITY: NO key material in the browser. There is no client-side signing, no
// mnemonic, no private key, nothing in sessionStorage/localStorage. The command
// shapes + demo economics are copied verbatim from app/scripts/close-wallets.ts,
// proven against continuum-contracts 1.1.0 on 5N devnet.
import { useMemo } from 'react';
import { HttpLedgerClient } from '../../../ledger-client/src/client';
import type { ActiveContract, JsCommand } from '../../../ledger-client/src/types';
import { useSession } from '../state/WalletSession';
import { useToast } from '../state/Toast';

// Per-party reads proxy (session-scoped by the backend). Same-origin, so the
// httpOnly session cookie rides along automatically (default `credentials`).
export const reads = new HttpLedgerClient('/api');

// Fully-qualified create/exercise template ids the deployed 1.1.0 contracts
// expect (#package:Module:Entity). Verbatim from close-wallets.ts `T`.
export const T = {
  deal: '#continuum-contracts:Continuum.Deal:ContinuationDeal',
  holding: '#continuum-contracts:Continuum.Registry:RegistryHolding',
  factory: '#continuum-contracts:Continuum.Registry:RegistryAllocationFactory',
  alloc: '#continuum-contracts:Continuum.Registry:RegistryAllocation',
  execDeleg: '#continuum-contracts:Continuum.Registry:ExecDelegation',
  execDelegProp: '#continuum-contracts:Continuum.Registry:ExecDelegationProposal',
  valuation: '#continuum-contracts:Continuum.Valuation:ValuationReport',
  opinion: '#continuum-contracts:Continuum.Valuation:FairnessOpinion',
  cert: '#continuum-contracts:Continuum.Auction:AuctionCertificate',
  sealedBid: '#continuum-contracts:Continuum.Auction:SealedBid',
  election: '#continuum-contracts:Continuum.Election:LPElection',
  consent: '#continuum-contracts:Continuum.Consent:LPACConsent',
  psa: '#continuum-contracts:Continuum.Issuance:PurchaseAgreement',
  basis: '#continuum-contracts:Continuum.Issuance:IssuanceBasis',
  interest: '#continuum-contracts:Continuum.Participation:OldFundInterest',
  interestOffer: '#continuum-contracts:Continuum.Participation:OldFundInterestOffer',
  dealPart: '#continuum-contracts:Continuum.Participation:DealParticipation',
  accPart: '#continuum-contracts:Continuum.Participation:AcceptedParticipation',
  receipt: '#continuum-contracts:Continuum.Deal:SettlementReceipt',
  disclosure: '#continuum-contracts:Continuum.Deal:FairnessDisclosure',
  allocFactoryIface:
    '#splice-api-token-allocation-instruction-v1:Splice.Api.Token.AllocationInstructionV1:AllocationFactory',
} as const;

// `activeContracts({ templateId })` matches on `endsWith`, so a short suffix is
// enough for reads (the returned id is `<pkgId>:Module:Entity`).
export const R = {
  deal: 'Deal:ContinuationDeal',
  holding: 'Registry:RegistryHolding',
  factory: 'Registry:RegistryAllocationFactory',
  alloc: 'Registry:RegistryAllocation',
  execDeleg: 'Registry:ExecDelegation',
  execDelegProp: 'Registry:ExecDelegationProposal',
  valuation: 'Valuation:ValuationReport',
  opinion: 'Valuation:FairnessOpinion',
  cert: 'Auction:AuctionCertificate',
  sealedBid: 'Auction:SealedBid',
  election: 'Election:LPElection',
  consent: 'Consent:LPACConsent',
  psa: 'Issuance:PurchaseAgreement',
  basis: 'Issuance:IssuanceBasis',
  interest: 'Participation:OldFundInterest',
  interestOffer: 'Participation:OldFundInterestOffer',
  dealPart: 'Participation:DealParticipation',
  accPart: 'Participation:AcceptedParticipation',
  receipt: 'Deal:SettlementReceipt',
  disclosure: 'Deal:FairnessDisclosure',
} as const;

// Well-known counterparties + their custodians, populated ONCE from the PUBLIC
// `/registry` (party ids are public; NO keys are ever included). The signed-in
// role always acts as its OWN session party (enforced server-side); references to
// the OTHER seats resolve to these ids so the wired commands typecheck and submit.
export const counter: Record<'gp' | 'buyer' | 'lpExiting' | 'lpRolling' | 'lpac', string> = {
  gp: '',
  buyer: '',
  lpExiting: '',
  lpRolling: '',
  lpac: '',
};

/** role → custodian display name (from `/registry`). For institutional chrome. */
export const custodians: Record<string, string> = {};

let registryLoaded = false;

/**
 * Fetch the PUBLIC registry once and populate `counter` + `custodians` in place
 * (views hold a live reference to the same objects). Idempotent.
 */
export async function loadRegistry(): Promise<void> {
  if (registryLoaded) return;
  const r = await fetch('/registry', { credentials: 'include' });
  if (!r.ok) throw new Error(`/registry → ${r.status}`);
  const body = await r.json();
  Object.assign(counter, body?.parties ?? {});
  Object.assign(custodians, body?.custodians ?? {});
  registryLoaded = true;
}

// Demo economics — identical to close-wallets.ts so a cross-tab live run ties out.
// dealId ('M1') is the join key across SealedBid/LPElection/certs/basis; it is
// deliberately distinct from the deal's human-readable `cv`.
export const DEAL_ID = 'M1';
export const DEMO = {
  cv: 'Meridian CV I',
  fund: 'Meridian Growth Fund III',
  asset: 'Project Atlas',
  clearingPct: '0.96',
  refNav: '5000000.0',
  reconciledNav: '5000000.0',
  psaPrice: '4800000.0',
  unitAmt: '4800000.0',
  cashAmt: '4608000.0',
  interestNav: '1000000.0',
  contentHash: 'deadbeef',
  fairnessHash: 'continuum-fairness-v1',
  closeDate: '2026-06-30',
  electionDeadline: '2026-12-31T00:00:00Z',
  usdc: 'USDC',
  unit: 'MERIDIAN-CV-I',
} as const;

export const shortParty = (p?: string | null): string => (p ? p.split('::')[0] : '—');
const shortId = (id?: string): string => (id ? (id.length > 12 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id) : '—');

/** Result of a custody-signed submit. `contract` present only if `awaitTemplate` matched. */
export type SubmitResult = { updateId?: string; contract?: ActiveContract };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Poll the party's ACS until a contract of `templateSuffix` appears; newest wins. */
async function pollForContract(
  party: string,
  templateSuffix: string,
  tries = 8,
  delayMs = 700,
): Promise<ActiveContract | undefined> {
  for (let i = 0; i < tries; i++) {
    await sleep(delayMs);
    const acs = await reads.activeContracts(party, { templateId: templateSuffix });
    if (acs.length) return acs[acs.length - 1];
  }
  return undefined;
}

export type Ledger = ReturnType<typeof useLedger>;

/**
 * The signing + reading surface for a persona view. `me` is the logged-in party.
 * `submit` routes through the custody backend — the browser holds no key.
 */
export function useLedger() {
  const { party, custodianName } = useSession();
  const toast = useToast();
  return useMemo(() => {
    const me = party as string;
    return {
      me,
      reads,
      /** This role's OWN per-party ACS projection for `templateSuffix`. */
      myAcs: (templateSuffix: string) => reads.activeContracts(me, { templateId: templateSuffix }),
      /** Another party's projection (backend forces the session party, so honest). */
      acsOf: (p: string, templateSuffix: string) =>
        reads.activeContracts(p, { templateId: templateSuffix }),
      /**
       * Submit commands — the CUSTODY BACKEND signs with the session party's key.
       * Pass `awaitTemplate` to poll for and return the created contract.
       */
      submit: async (commands: JsCommand[], awaitTemplate?: string): Promise<SubmitResult> => {
        const tid = toast.show(`signing via ${custodianName ?? 'custodian'}…`, 'pending');
        try {
          const r = await fetch('/action', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ commands }),
          });
          const txt = await r.text();
          if (!r.ok) {
            let msg = txt;
            try {
              msg = JSON.parse(txt)?.error ?? txt;
            } catch {
              /* non-JSON error body */
            }
            throw new Error(msg || `action failed (${r.status})`);
          }
          const body = txt ? JSON.parse(txt) : {};
          const updateId: string | undefined = body?.updateId;
          toast.update(tid, `committed · updateId ${shortId(updateId)}`, 'success');
          const result: SubmitResult = { updateId };
          if (awaitTemplate) {
            const contract = await pollForContract(me, awaitTemplate);
            if (contract) result.contract = contract;
          }
          return result;
        } catch (e) {
          toast.update(tid, e instanceof Error ? e.message : String(e), 'error');
          throw e;
        }
      },
    };
  }, [party, custodianName, toast]);
}
