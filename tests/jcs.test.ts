import { describe, expect, test } from "bun:test";
import { jcsBytes } from "../src/jcs.ts";

describe("jcsBytes", () => {
  test("orders object keys lexicographically", () => {
    const bytes = jcsBytes({ b: 1, a: 2 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":2,"b":1}');
  });

  test("returns a Uint8Array", () => {
    const bytes = jcsBytes({ x: 1 });
    expect(bytes).toBeInstanceOf(Uint8Array);
  });

  test("encodes UTF-8 for non-ASCII content", () => {
    const bytes = jcsBytes({ s: "café" });
    // "café" in UTF-8: 63 61 66 c3 a9
    const decoded = new TextDecoder().decode(bytes);
    expect(decoded).toBe('{"s":"café"}');
    // ensure é is two UTF-8 bytes, not one — total: '{"s":"caf' (9) + é (2) + '"}' (2) = 13
    expect(bytes.length).toBe(13);
  });

  test("recurses into nested objects", () => {
    const bytes = jcsBytes({ b: { y: 2, x: 1 }, a: 1 });
    expect(new TextDecoder().decode(bytes)).toBe('{"a":1,"b":{"x":1,"y":2}}');
  });
});
