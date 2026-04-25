import { describe, expect, test } from "bun:test";
import { capture } from "../src/capture.ts";
import type { StepRecord } from "../src/schema.ts";
import { generateKeyPair, signBundle, verifyBundleSignature } from "../src/sign.ts";

const step: StepRecord = {
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  sampling: { temperature: 0, top_p: 1 },
  inputs: { system_prompt: "x", messages: [{ role: "user", content: "hi" }] },
  runtime: { class: "cloud" },
  expected: { transcript: { foo: "bar" } },
  tolerance: { level: "byte" },
};

describe("sign / verify", () => {
  test("generateKeyPair returns 32-byte private and public keys", () => {
    const kp = generateKeyPair();
    expect(kp.privateKey.length).toBe(32);
    expect(kp.publicKey.length).toBe(32);
  });

  test("signBundle adds a signature block with alg=ed25519", () => {
    const kp = generateKeyPair();
    const bundle = capture(step);
    const signed = signBundle(bundle, kp.privateKey);
    expect(signed.signature?.alg).toBe("ed25519");
    expect(signed.signature?.pubkey).toBeTruthy();
    expect(signed.signature?.sig).toBeTruthy();
  });

  test("verifyBundleSignature returns valid for a freshly signed bundle", () => {
    const kp = generateKeyPair();
    const bundle = capture(step);
    const signed = signBundle(bundle, kp.privateKey);
    const r = verifyBundleSignature(signed);
    expect(r.valid).toBe(true);
  });

  test("verifyBundleSignature returns valid for an unsigned bundle (no sig to check)", () => {
    const bundle = capture(step);
    const r = verifyBundleSignature(bundle);
    expect(r.valid).toBe(true);
  });

  test("mutating a payload field invalidates the signature", () => {
    const kp = generateKeyPair();
    const signed = signBundle(capture(step), kp.privateKey);
    const tampered = {
      ...signed,
      sampling: { ...signed.sampling, temperature: 0.7 },
    };
    const r = verifyBundleSignature(tampered);
    expect(r.valid).toBe(false);
  });

  test("mutating signature.sig invalidates the signature", () => {
    const kp = generateKeyPair();
    const signed = signBundle(capture(step), kp.privateKey);
    // flip first base64 char (still valid base64)
    const sig = signed.signature?.sig as string;
    const flipped = (sig.charAt(0) === "A" ? "B" : "A") + sig.slice(1);
    const tampered = {
      ...signed,
      signature: { ...signed.signature!, sig: flipped },
    };
    const r = verifyBundleSignature(tampered);
    expect(r.valid).toBe(false);
  });

  test("two signatures over the same bundle with the same key are byte-identical (deterministic)", () => {
    // Ed25519 signatures are deterministic per RFC 8032.
    const kp = generateKeyPair();
    const bundle = capture(step);
    const a = signBundle(bundle, kp.privateKey);
    const b = signBundle(bundle, kp.privateKey);
    expect(a.signature?.sig).toBe(b.signature?.sig);
  });
});
