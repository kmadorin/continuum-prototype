import { describe, it, expect, vi } from 'vitest';
import * as ed from '@noble/ed25519';
import { keyFromMnemonic, generateMnemonic, signHash, b64ToBytes } from '../src/ed25519';
import { WalletClient } from '../src/wallet';
import { HttpLedgerClient } from '../src/client';

const okJson = (obj: any) => ({ ok: true, status: 200, text: async () => JSON.stringify(obj) });
// A stable 12-word BIP-39 mnemonic (valid checksum).
const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';

describe('ed25519 primitives', () => {
  it('(a) keyFromMnemonic is deterministic and round-trips sign/verify', () => {
    const k1 = keyFromMnemonic(MNEMONIC);
    const k2 = keyFromMnemonic(MNEMONIC);
    expect(k1.derPubB64).toBe(k2.derPubB64);
    expect(k1.rawPub.length).toBe(32);
    // DER SPKI is 44 raw bytes -> base64; must start with the ed25519 SPKI prefix.
    expect(Buffer.from(k1.derPubB64, 'base64').subarray(0, 12).toString('hex'))
      .toBe('302a300506032b6570032100');
    const msg = new Uint8Array([1, 2, 3, 4]);
    const sig = ed.sign(msg, k1.priv);
    expect(ed.verify(sig, msg, k1.rawPub)).toBe(true);
  });

  it('generateMnemonic yields a distinct 12-word phrase usable as a key', () => {
    const m = generateMnemonic();
    expect(m.split(' ').length).toBe(12);
    expect(m).not.toBe(MNEMONIC);
    expect(keyFromMnemonic(m).rawPub.length).toBe(32);
  });

  it('(b) signHash produces a 64-byte base64 signature verifiable against the pub key', () => {
    const k = keyFromMnemonic(MNEMONIC);
    const hashBytes = new Uint8Array(32).map((_, i) => (i * 7) & 0xff);
    const b64hash = Buffer.from(hashBytes).toString('base64');
    const sigB64 = signHash(k.priv, b64hash);
    const sig = b64ToBytes(sigB64);
    expect(sig.length).toBe(64);
    expect(ed.verify(sig, hashBytes, k.rawPub)).toBe(true);
  });
});

describe('WalletClient.onboard', () => {
  it('(c) posts generate-topology then allocate with correct shapes + well-formed SIG', async () => {
    const key = keyFromMnemonic(MNEMONIC);
    const multiHash = Buffer.from(new Uint8Array(48).fill(3)).toString('base64');
    const topoResp = {
      partyId: 'buyer::ns', publicKeyFingerprint: '1220deadbeef',
      multiHash, topologyTransactions: ['txA', 'txB'],
    };
    const f = vi.fn()
      .mockResolvedValueOnce(okJson(topoResp))
      .mockResolvedValueOnce(okJson({ partyId: 'buyer::ns' })) as any;
    const reads = new HttpLedgerClient('http://p', f);
    const w = new WalletClient('http://p', reads, f, 'sync::1');

    const out = await w.onboard('buyer-hint', MNEMONIC);
    expect(out).toEqual({ partyId: 'buyer::ns', fingerprint: '1220deadbeef' });

    // call 0: generate-topology
    expect(f.mock.calls[0][0]).toBe('http://p/v2/parties/external/generate-topology');
    const topoBody = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(topoBody.synchronizer).toBe('sync::1');
    expect(topoBody.partyHint).toBe('buyer-hint');
    expect(topoBody.publicKey).toEqual({
      format: 'CRYPTO_KEY_FORMAT_DER_X509_SUBJECT_PUBLIC_KEY_INFO',
      keyData: key.derPubB64,
      keySpec: 'SIGNING_KEY_SPEC_EC_CURVE25519',
    });

    // call 1: allocate
    expect(f.mock.calls[1][0]).toBe('http://p/v2/parties/external/allocate');
    const allocBody = JSON.parse((f.mock.calls[1][1] as any).body);
    expect(allocBody.synchronizer).toBe('sync::1');
    expect(allocBody.onboardingTransactions).toEqual([{ transaction: 'txA' }, { transaction: 'txB' }]);
    expect(allocBody.waitForAllocation).toBe(true);
    expect(allocBody.userId).toBe('6');
    const sig = allocBody.multiHashSignatures[0];
    expect(sig.format).toBe('SIGNATURE_FORMAT_CONCAT');
    expect(sig.signingAlgorithmSpec).toBe('SIGNING_ALGORITHM_SPEC_ED25519');
    expect(sig.signedBy).toBe('1220deadbeef');
    // signature must verify over the base64-decoded multiHash with the party's key.
    expect(ed.verify(b64ToBytes(sig.signature), b64ToBytes(multiHash), key.rawPub)).toBe(true);
  });
});

describe('WalletClient.submitSigned', () => {
  it('(d) prepare -> sign -> execute with the required fields and signature placement', async () => {
    const key = keyFromMnemonic(MNEMONIC);
    const preparedHash = Buffer.from(new Uint8Array(32).fill(9)).toString('base64');
    const prepResp = {
      preparedTransaction: 'PREP_TX_BLOB',
      preparedTransactionHash: preparedHash,
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    };
    const f = vi.fn()
      .mockResolvedValueOnce(okJson(prepResp))
      .mockResolvedValueOnce(okJson({})) as any;
    const reads = new HttpLedgerClient('http://p', f);
    const w = new WalletClient('http://p', reads, f, 'sync::1');

    const commands = [{ CreateCommand: { templateId: '#pkg:M:T', createArguments: { a: 1 } } }];
    await w.submitSigned('buyer::ns', key, '1220deadbeef', commands as any);

    // call 0: prepare
    expect(f.mock.calls[0][0]).toBe('http://p/v2/interactive-submission/prepare');
    const prepBody = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(prepBody.actAs).toEqual(['buyer::ns']);
    expect(prepBody.synchronizerId).toBe('sync::1');
    expect(prepBody.packageIdSelectionPreference).toEqual([]);
    expect(prepBody.verboseHashing).toBe(false);
    expect(prepBody.commands).toEqual(commands);
    expect(prepBody.disclosedContracts).toBeUndefined();

    // call 1: execute (synchronous variant — surfaces async Daml rejections + returns updateId)
    expect(f.mock.calls[1][0]).toBe('http://p/v2/interactive-submission/executeAndWaitForTransaction');
    const execBody = JSON.parse((f.mock.calls[1][1] as any).body);
    expect(execBody.preparedTransaction).toBe('PREP_TX_BLOB');
    expect(execBody.hashingSchemeVersion).toBe('HASHING_SCHEME_VERSION_V2');
    expect(execBody.deduplicationPeriod).toEqual({ Empty: {} });
    const partySig = execBody.partySignatures.signatures[0];
    expect(partySig.party).toBe('buyer::ns');
    const sig = partySig.signatures[0];
    expect(sig.format).toBe('SIGNATURE_FORMAT_CONCAT');
    expect(sig.signedBy).toBe('1220deadbeef');
    expect(ed.verify(b64ToBytes(sig.signature), b64ToBytes(preparedHash), key.rawPub)).toBe(true);
  });

  it('passes disclosedContracts through to prepare when provided', async () => {
    const key = keyFromMnemonic(MNEMONIC);
    const prepResp = {
      preparedTransaction: 'X', preparedTransactionHash: Buffer.from(new Uint8Array(32)).toString('base64'),
      hashingSchemeVersion: 'HASHING_SCHEME_VERSION_V2',
    };
    const f = vi.fn().mockResolvedValueOnce(okJson(prepResp)).mockResolvedValueOnce(okJson({})) as any;
    const w = new WalletClient('http://p', new HttpLedgerClient('http://p', f), f, 'sync::1');
    const disclosed = [{ contractId: 'c', createdEventBlob: 'b', templateId: '#p:M:T', synchronizerId: 'sync::1' }];
    await w.submitSigned('buyer::ns', key, 'fp', [] as any, disclosed);
    const prepBody = JSON.parse((f.mock.calls[0][1] as any).body);
    expect(prepBody.disclosedContracts).toEqual(disclosed);
  });
});
