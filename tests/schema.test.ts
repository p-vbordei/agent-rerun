import { describe, expect, test } from "bun:test";
import { ActualRecordSchema, BundleSchema } from "../src/schema.ts";

const validByteBundle = {
  rerun_version: "0.1",
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  sampling: { temperature: 0, top_p: 1 },
  inputs: {
    system_prompt_sha256: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    messages_sha256: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  runtime: { class: "cloud" },
  expected: {
    transcript_sha256: "sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  },
  tolerance: { level: "byte" },
};

const validActualRecord = {
  inputs: {
    system_prompt: "you are helpful",
    messages: [{ role: "user", content: "hi" }],
  },
  output: { transcript: { foo: "bar" } },
};

describe("BundleSchema", () => {
  test("accepts a minimal byte-tolerance bundle", () => {
    const r = BundleSchema.safeParse(validByteBundle);
    expect(r.success).toBe(true);
  });

  test("rejects when rerun_version is wrong", () => {
    const r = BundleSchema.safeParse({ ...validByteBundle, rerun_version: "0.2" });
    expect(r.success).toBe(false);
  });

  test("rejects when an input hash is malformed", () => {
    const r = BundleSchema.safeParse({
      ...validByteBundle,
      inputs: { ...validByteBundle.inputs, messages_sha256: "not-a-hash" },
    });
    expect(r.success).toBe(false);
  });

  test("rejects byte tolerance without expected.transcript_sha256", () => {
    const r = BundleSchema.safeParse({
      ...validByteBundle,
      expected: {},
    });
    expect(r.success).toBe(false);
  });

  test("rejects semantic tolerance without expected.semantic_embedding", () => {
    const r = BundleSchema.safeParse({
      ...validByteBundle,
      expected: {},
      tolerance: { level: "semantic", threshold: 0.95 },
    });
    expect(r.success).toBe(false);
  });

  test("rejects semantic tolerance without tolerance.threshold", () => {
    const r = BundleSchema.safeParse({
      ...validByteBundle,
      expected: { semantic_embedding: "AAAA" },
      tolerance: { level: "semantic" },
    });
    expect(r.success).toBe(false);
  });

  test("accepts a valid semantic-tolerance bundle", () => {
    const r = BundleSchema.safeParse({
      ...validByteBundle,
      expected: { semantic_embedding: "AAAA" },
      tolerance: { level: "semantic", threshold: 0.95 },
    });
    expect(r.success).toBe(true);
  });

  test("accepts an optional signature block", () => {
    const r = BundleSchema.safeParse({
      ...validByteBundle,
      signature: { alg: "ed25519", pubkey: "AAAA", sig: "BBBB" },
    });
    expect(r.success).toBe(true);
  });

  test("rejects signature with non-ed25519 alg", () => {
    const r = BundleSchema.safeParse({
      ...validByteBundle,
      signature: { alg: "rs256", pubkey: "x", sig: "y" },
    });
    expect(r.success).toBe(false);
  });
});

describe("ActualRecordSchema", () => {
  test("accepts a valid actual record", () => {
    const r = ActualRecordSchema.safeParse(validActualRecord);
    expect(r.success).toBe(true);
  });

  test("rejects when inputs.messages is missing", () => {
    const r = ActualRecordSchema.safeParse({
      inputs: { system_prompt: "x" },
      output: {},
    });
    expect(r.success).toBe(false);
  });

  test("accepts a record with only an embedding (no transcript)", () => {
    const r = ActualRecordSchema.safeParse({
      inputs: { system_prompt: "x", messages: [] },
      output: { embedding: "AAAA" },
    });
    expect(r.success).toBe(true);
  });
});
