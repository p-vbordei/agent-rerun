import canonicalize from "canonicalize";

/** UTF-8 bytes of the RFC 8785 JCS encoding of `value`. */
export function jcsBytes(value: unknown): Uint8Array {
  const s = canonicalize(value);
  if (typeof s !== "string") {
    throw new Error("jcsBytes: canonicalize returned non-string (value contains undefined?)");
  }
  return new TextEncoder().encode(s);
}
