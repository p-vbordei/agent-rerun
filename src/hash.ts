import { sha256 } from "@noble/hashes/sha2";
import { jcsBytes } from "./jcs.ts";

/** Hex-encoded SHA-256 prefixed with `sha256:`. */
export function sha256Hex(bytes: Uint8Array): string {
  const digest = sha256(bytes);
  let hex = "";
  for (const b of digest) hex += b.toString(16).padStart(2, "0");
  return `sha256:${hex}`;
}

/** SHA-256 of the RFC 8785 JCS encoding of `value`. */
export function sha256OfJcs(value: unknown): string {
  return sha256Hex(jcsBytes(value));
}
