// Task 7 seam: turn the per-tab wallet session into a signing ledger client.
//
// Every persona view submits its OWN on-ledger actions by signing with the
// logged-in role's wallet key (session.key) via the interactive-submission API.
// Reads use the real per-party Canton projection: activeContracts(session.party)
// returns exactly what THAT role is a stakeholder of — the privacy story, not a
// sim. Command/template shapes are copied verbatim from app/scripts/close-wallets.ts,
// which is proven against the deployed continuum-contracts 1.1.0 on 5N devnet.
//
// SECURITY: the private key never leaves this process. submitSigned signs the
// prepared-transaction hash locally; only the resulting signature + public
// fingerprint go to the ledger. Nothing here logs, persists, or transmits
// session.key or the mnemonic.
import { useMemo } from 'react';
import { HttpLedgerClient } from '../../../ledger-client/src/client';
import { WalletClient } from '../../../ledger-client/src/wallet';
import type { JsCommand } from '../../../ledger-client/src/types';
import registry from '../party-registry.json';
import { useSession } from '../state/WalletSession';

// Shared, tab-lifetime clients. Reads + interactive submission both go through
// the Vite dev-proxy (/api → reverse-proxy → ledger API). The synchronizer id is
// pinned from the registry so onboarding needs no discovery round-trip. App.tsx
// reuses `walletClient` as the session's Onboarder, so a tab holds ONE client.
export const reads = new HttpLedgerClient('/api');
export const walletClient = new WalletClient('/api', reads, undefined, registry.synchronizerId);

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

// Well-known counterparties from the PUBLIC registry. The signed-in role always
// signs as its OWN freshly-onboarded wallet (session.party); references to the
// OTHER seats resolve to these seeded parties so the wired commands typecheck and
// submit. A fully-live 5-party close (every seat its own fresh wallet, discovered
// cross-tab) is Task 9 — see plan.
const P = registry.parties as Record<string, string>;
export const counter = {
  gp: P.gp,
  buyer: P.buyer,
  lpExiting: P.lpExiting ?? P.lp,
  lpRolling: P.lpRolling ?? P.lp2,
  lpac: P.lpac,
};

// Demo economics — identical to close-wallets.ts so a Task 9 cross-tab run ties
// out. dealId ('M1') is the join key across SealedBid/LPElection/certs/basis; it
// is deliberately distinct from the deal's human-readable `cv`.
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

export type Ledger = ReturnType<typeof useLedger>;

/**
 * The signing + reading surface for a persona view. Only usable from a signed-in
 * tab (App routes views only when isSignedIn); `me` is the logged-in party.
 */
export function useLedger() {
  const { party, key, fingerprint } = useSession();
  return useMemo(() => {
    const me = party as string;
    return {
      me,
      reads,
      /** This role's OWN per-party ACS projection for `templateSuffix`. */
      myAcs: (templateSuffix: string) => reads.activeContracts(me, { templateId: templateSuffix }),
      /** Another party's projection (used only for honest cross-party privacy proofs). */
      acsOf: (p: string, templateSuffix: string) =>
        reads.activeContracts(p, { templateId: templateSuffix }),
      /**
       * Submit commands signed by the logged-in role's OWN wallet key. Pass
       * `awaitTemplate` to poll for and return the created contract.
       */
      submit: (commands: JsCommand[], awaitTemplate?: string) => {
        if (!key || !fingerprint) throw new Error('not signed in');
        return walletClient.submitSigned(
          me,
          key,
          fingerprint,
          commands,
          undefined,
          awaitTemplate ? { awaitTemplate } : {},
        );
      },
    };
  }, [party, key, fingerprint]);
}
