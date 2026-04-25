import * as ed25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2";
import { jcsBytes } from "./jcs.ts";
import type { Bundle } from "./schema.ts";

// Wire SHA-512 for the synchronous Ed25519 API (RFC 8032).
ed25519.etc.sha512Sync = (...m: Uint8Array[]) => sha512(ed25519.etc.concatBytes(...m));

export type KeyPair = { publicKey: Uint8Array; privateKey: Uint8Array };

/** Generate a random Ed25519 keypair. */
export function generateKeyPair(): KeyPair {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = ed25519.getPublicKey(privateKey);
  return { publicKey, privateKey };
}

/** Sign a bundle's JCS bytes (without "signature") and return the bundle with a signature block. */
export function signBundle(bundle: Bundle, privateKey: Uint8Array): Bundle {
  const { signature: _drop, ...payload } = bundle;
  const sig = ed25519.sign(jcsBytes(payload), privateKey);
  const publicKey = ed25519.getPublicKey(privateKey);
  return {
    ...payload,
    signature: {
      alg: "ed25519",
      pubkey: b64encode(publicKey),
      sig: b64encode(sig),
    },
  };
}

/** Verify a bundle's signature, if present. Unsigned bundles return `{ valid: true }`. */
export function verifyBundleSignature(bundle: Bundle): { valid: boolean; reason?: string } {
  if (!bundle.signature) return { valid: true };
  const { signature, ...payload } = bundle;
  try {
    const ok = ed25519.verify(
      b64decode(signature.sig),
      jcsBytes(payload),
      b64decode(signature.pubkey),
    );
    return ok ? { valid: true } : { valid: false, reason: "signature does not match payload" };
  } catch (e) {
    return { valid: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

function b64encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function b64decode(s: string): Uint8Array {
  const b = Buffer.from(s, "base64");
  return new Uint8Array(b.buffer, b.byteOffset, b.byteLength);
}
