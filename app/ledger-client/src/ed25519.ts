// app/ledger-client/src/ed25519.ts
// Browser+Node-safe Ed25519 key + signing primitives for Canton external parties.
// Verified byte-exact against node's `crypto` (SPKI DER wrap + pure-Ed25519 sign)
// on the devnet validator via the wallet spike.
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { generateMnemonic as genMnemonic, mnemonicToSeedSync } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

// @noble/ed25519 v3 needs a sync sha512 to expose sync getPublicKey/sign/verify.
// (v3 moved this from `etc.sha512Sync` to the mutable `hashes.sha512` hook.)
ed.hashes.sha512 = (msg: Uint8Array) => sha512(msg);

export type Ed25519Key = {
  /** 32-byte Ed25519 seed / private scalar source. */
  priv: Uint8Array;
  /** raw 32-byte public key. */
  rawPub: Uint8Array;
  /** public key as DER X.509 SubjectPublicKeyInfo, base64 (what Canton wants). */
  derPubB64: string;
};

// DER SPKI prefix for an Ed25519 public key: 302a300506032b6570032100 ++ raw32.
const DER_SPKI_PREFIX = new Uint8Array([
  0x30, 0x2a, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x03, 0x21, 0x00,
]);

/** Encode bytes to base64 (works in both Node 18+ and browsers via btoa). */
export function bytesToB64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

/** Decode base64 to bytes (works in both Node 18+ and browsers via atob). */
export function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Wrap a raw 32-byte Ed25519 public key as DER SPKI, base64-encoded. */
export function derSpkiB64(rawPub: Uint8Array): string {
  const out = new Uint8Array(DER_SPKI_PREFIX.length + rawPub.length);
  out.set(DER_SPKI_PREFIX);
  out.set(rawPub, DER_SPKI_PREFIX.length);
  return bytesToB64(out);
}

/** Deterministically derive an Ed25519 key from a BIP-39 mnemonic. */
export function keyFromMnemonic(mnemonic: string): Ed25519Key {
  const seed = mnemonicToSeedSync(mnemonic.trim());
  const priv = seed.slice(0, 32);
  const rawPub = ed.getPublicKey(priv);
  return { priv, rawPub, derPubB64: derSpkiB64(rawPub) };
}

/** Generate a fresh 12-word BIP-39 mnemonic. */
export function generateMnemonic(): string {
  return genMnemonic(wordlist);
}

/**
 * Sign a Canton hash: pure Ed25519 (no prehash) over the base64-decoded hash
 * bytes; returns the 64-byte signature base64-encoded. Matches the spike's
 * `crypto.sign(null, Buffer.from(b64hash,'base64'), key)`.
 */
export function signHash(priv: Uint8Array, b64hash: string): string {
  return bytesToB64(ed.sign(b64ToBytes(b64hash), priv));
}

/** Verify a base64 signature over a base64 hash against a raw public key. */
export function verifyHash(sigB64: string, b64hash: string, rawPub: Uint8Array): boolean {
  return ed.verify(b64ToBytes(sigB64), b64ToBytes(b64hash), rawPub);
}
