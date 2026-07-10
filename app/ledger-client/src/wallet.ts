// app/ledger-client/src/wallet.ts
// WalletClient: onboard a Canton EXTERNAL PARTY (own Ed25519 key) and submit
// transactions it signs itself via the interactive-submission API. Builds on
// HttpLedgerClient (for reads). Keys are held in memory by the caller and are
// NEVER persisted to disk here.
import type { HttpLedgerClient } from './client';
import type { JsCommand, Disclosed, ActiveContract } from './types';
import { keyFromMnemonic, signHash, type Ed25519Key } from './ed25519';

const SIGNING_ALGORITHM_SPEC = 'SIGNING_ALGORITHM_SPEC_ED25519';
const SIGNATURE_FORMAT = 'SIGNATURE_FORMAT_CONCAT';

/** Canton signature object used by both allocate and execute. */
function signature(sigB64: string, fingerprint: string) {
  return {
    format: SIGNATURE_FORMAT,
    signature: sigB64,
    signedBy: fingerprint,
    signingAlgorithmSpec: SIGNING_ALGORITHM_SPEC,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type OnboardResult = { partyId: string; fingerprint: string };

export type SubmitOptions = {
  /** Override the constructor/discovered synchronizer for this call. */
  synchronizer?: string;
  /**
   * If set, poll the party's ACS after execute (fire-and-forget) until a
   * contract of this template appears, and return the newest match.
   */
  awaitTemplate?: string;
  tries?: number;
  delayMs?: number;
};

export type SubmitResult = { updateId?: string; contract?: ActiveContract };

export class WalletClient {
  constructor(
    private base: string,
    private reads: HttpLedgerClient,
    private fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis),
    private synchronizerId?: string,
  ) {}

  private async post(path: string, body: unknown, retries = 8): Promise<any> {
    for (let attempt = 0; ; attempt++) {
      const r = await this.fetchImpl(`${this.base}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const txt = await r.text();
      if (r.ok) return txt ? JSON.parse(txt) : {};
      // Shared devnet sequencer rate-limits (~26 tx/60s/validator). Retry contention
      // (category 2 / SEQUENCER_OVERLOADED / backpressure) with backoff.
      const contention = r.status === 409 || /SEQUENCER_OVERLOADED|BACKPRESSURE|"errorCategory":2/.test(txt);
      if (contention && attempt < retries) {
        await sleep(1500 + attempt * 1200);
        continue;
      }
      throw new Error(`${path} → ${r.status}: ${txt}`);
    }
  }

  private resolveSync(override?: string): string {
    const sync = override ?? this.synchronizerId;
    if (!sync) {
      throw new Error(
        'WalletClient: synchronizerId required — pass it to the constructor, ' +
          'to onboard()/submitSigned(), or call discoverSynchronizer(party) first.',
      );
    }
    return sync;
  }

  /**
   * Discover the synchronizer id from an existing party's active contracts and
   * cache it (mirrors the spike). Handy before onboarding the first party.
   */
  async discoverSynchronizer(party: string): Promise<string> {
    const acs = await this.reads.activeContracts(party);
    const sync = acs.map((a) => a.synchronizerId).find(Boolean);
    if (!sync) throw new Error(`no synchronizerId discoverable from ${party}'s ACS`);
    this.synchronizerId = sync;
    return sync;
  }

  /**
   * Onboard an external party: generate-topology → sign multiHash → allocate.
   * `mnemonicOrKey` may be a BIP-39 mnemonic (deterministic key) or a key.
   * Returns the allocated partyId and Canton's public-key fingerprint (which
   * MUST be used as `signedBy` on every subsequent signature).
   */
  async onboard(
    partyHint: string,
    mnemonicOrKey: string | Ed25519Key,
    synchronizer?: string,
  ): Promise<OnboardResult> {
    const key = typeof mnemonicOrKey === 'string' ? keyFromMnemonic(mnemonicOrKey) : mnemonicOrKey;
    const sync = this.resolveSync(synchronizer);

    const topo = await this.post('/v2/parties/external/generate-topology', {
      synchronizer: sync,
      partyHint,
      publicKey: {
        format: 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO',
        keyData: key.derPubB64,
        keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
      },
    });
    const fingerprint: string = topo.publicKeyFingerprint;

    const sig = signature(signHash(key.priv, topo.multiHash), fingerprint);
    const alloc = await this.post('/v2/parties/external/allocate', {
      synchronizer: sync,
      onboardingTransactions: (topo.topologyTransactions as unknown[]).map((t) => ({ transaction: t })),
      multiHashSignatures: [sig],
      waitForAllocation: true,
      userId: '6',
    });

    return { partyId: alloc.partyId, fingerprint };
  }

  /**
   * Submit party-signed commands: prepare → sign preparedTransactionHash →
   * execute. Execute is fire-and-forget (returns {}); pass opts.awaitTemplate to
   * poll the party's ACS and return the created contract.
   */
  async submitSigned(
    party: string,
    key: Ed25519Key,
    fingerprint: string,
    commands: JsCommand[],
    disclosedContracts?: Disclosed[],
    opts: SubmitOptions = {},
  ): Promise<SubmitResult> {
    const sync = this.resolveSync(opts.synchronizer);
    const commandId = `wallet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const prepBody: Record<string, unknown> = {
      commandId,
      actAs: [party],
      synchronizerId: sync,
      packageIdSelectionPreference: [],
      verboseHashing: false,
      commands,
    };
    if (disclosedContracts && disclosedContracts.length) {
      prepBody.disclosedContracts = disclosedContracts;
    }
    const prep = await this.post('/v2/interactive-submission/prepare', prepBody);

    const sig = signature(signHash(key.priv, prep.preparedTransactionHash), fingerprint);
    // executeAndWaitForTransaction blocks until the tx is committed and surfaces
    // async rejections as non-200 errors (plain `execute` is fire-and-forget and
    // hides Daml validation failures). It also returns the real updateId.
    const exec = await this.post('/v2/interactive-submission/executeAndWaitForTransaction', {
      preparedTransaction: prep.preparedTransaction,
      partySignatures: { signatures: [{ party, signatures: [sig] }] },
      submissionId: `${commandId}-sub`,
      hashingSchemeVersion: prep.hashingSchemeVersion,
      deduplicationPeriod: { Empty: {} },
    });

    const result: SubmitResult = { updateId: exec?.transaction?.updateId ?? exec?.updateId };
    if (opts.awaitTemplate) {
      const contract = await this.pollForContract(party, opts.awaitTemplate, opts.tries, opts.delayMs);
      if (contract) result.contract = contract;
    }
    return result;
  }

  private async pollForContract(
    party: string,
    templateId: string,
    tries = 8,
    delayMs = 700,
  ): Promise<ActiveContract | undefined> {
    for (let i = 0; i < tries; i++) {
      await sleep(delayMs);
      const acs = await this.reads.activeContracts(party, { templateId });
      if (acs.length) return acs[acs.length - 1];
    }
    return undefined;
  }
}
