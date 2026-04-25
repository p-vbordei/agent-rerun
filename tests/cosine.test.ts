import { describe, expect, test } from "bun:test";
import { cosine, decodeEmbedding, encodeEmbedding } from "../src/cosine.ts";

describe("cosine", () => {
  test("identical vectors → 1", () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosine(v, v)).toBeCloseTo(1, 6);
  });

  test("orthogonal vectors → 0", () => {
    const a = new Float32Array([1, 0]);
    const b = new Float32Array([0, 1]);
    expect(cosine(a, b)).toBeCloseTo(0, 6);
  });

  test("opposite vectors → -1", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosine(a, b)).toBeCloseTo(-1, 6);
  });

  test("throws on dimension mismatch", () => {
    expect(() => cosine(new Float32Array([1, 2]), new Float32Array([1, 2, 3]))).toThrow();
  });

  test("zero-magnitude vector throws", () => {
    expect(() => cosine(new Float32Array([0, 0, 0]), new Float32Array([1, 2, 3]))).toThrow();
  });
});

describe("encodeEmbedding / decodeEmbedding", () => {
  test("round-trips a Float32Array through base64", () => {
    const v = new Float32Array([1.5, -2.25, 3.125, 0]);
    const b64 = encodeEmbedding(v);
    const back = decodeEmbedding(b64);
    expect(Array.from(back)).toEqual(Array.from(v));
  });

  test("throws on non-multiple-of-4 byte length", () => {
    // base64 of 5 bytes = "AAAAAAA=" — 5 raw bytes ≠ multiple of 4
    expect(() => decodeEmbedding(Buffer.from(new Uint8Array(5)).toString("base64"))).toThrow();
  });
});
