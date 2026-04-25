/** Cosine similarity of two equal-length non-zero vectors. */
export function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`cosine: dimension mismatch (${a.length} vs ${b.length})`);
  }
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] as number;
    const y = b[i] as number;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) {
    throw new Error("cosine: zero-magnitude vector");
  }
  return dot / Math.sqrt(na * nb);
}

/** Encode a Float32Array as base64 (little-endian, the JS native order). */
export function encodeEmbedding(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
}

/** Decode a base64 string into a Float32Array. */
export function decodeEmbedding(b64: string): Float32Array {
  const buf = Buffer.from(b64, "base64");
  if (buf.byteLength % 4 !== 0) {
    throw new Error(
      `decodeEmbedding: byte length ${buf.byteLength} is not a multiple of 4 (Float32)`,
    );
  }
  // Copy into a fresh ArrayBuffer to honor the alignment Float32Array requires.
  const out = new Float32Array(buf.byteLength / 4);
  out.set(new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)));
  return out;
}
