import { describe, expect, test } from "bun:test";
import { sha256Hex, sha256OfJcs } from "../src/hash.ts";

describe("sha256Hex", () => {
  test("hashes the empty byte string to the known SHA-256 value", () => {
    const got = sha256Hex(new Uint8Array());
    expect(got).toBe(
      "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  test("hashes ASCII bytes correctly", () => {
    const got = sha256Hex(new TextEncoder().encode("abc"));
    expect(got).toBe(
      "sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  test("returns lowercase hex prefixed with sha256:", () => {
    const got = sha256Hex(new TextEncoder().encode("x"));
    expect(got.startsWith("sha256:")).toBe(true);
    expect(got.slice(7)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sha256OfJcs", () => {
  test("hashes JCS({}) to the known sha256 of the bytes '{}'", () => {
    // sha256 of the two ASCII bytes 0x7B 0x7D
    const got = sha256OfJcs({});
    expect(got).toBe(
      "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
    );
  });

  test("is order-independent for object keys", () => {
    const a = sha256OfJcs({ b: 1, a: 2 });
    const b = sha256OfJcs({ a: 2, b: 1 });
    expect(a).toBe(b);
  });
});
