import { describe, expect, test } from "bun:test";
import { capture } from "../src/capture.ts";
import type { ActualRecord, StepRecord } from "../src/schema.ts";
import { generateKeyPair } from "../src/sign.ts";
import { verify } from "../src/verify.ts";

const transcript = { messages: [{ role: "assistant", content: "hi there" }] };

const step: StepRecord = {
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  sampling: { temperature: 0, top_p: 1 },
  inputs: {
    system_prompt: "you are helpful",
    messages: [{ role: "user", content: "hello" }],
  },
  runtime: { class: "cloud" },
  expected: { transcript },
  tolerance: { level: "byte" },
};

const matchingActual: ActualRecord = {
  inputs: {
    system_prompt: "you are helpful",
    messages: [{ role: "user", content: "hello" }],
  },
  output: { transcript },
};

describe("verify (byte tolerance)", () => {
  test("passes when bundle and actual match", () => {
    const bundle = capture(step);
    const r = verify(bundle, matchingActual);
    expect(r.verified).toBe(true);
    expect(r.errors).toEqual([]);
  });

  test("fails when system_prompt differs (InputHashMismatch)", () => {
    const bundle = capture(step);
    const actual = {
      ...matchingActual,
      inputs: { ...matchingActual.inputs, system_prompt: "different prompt" },
    };
    const r = verify(bundle, actual);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.includes("system_prompt_sha256"))).toBe(true);
  });

  test("fails when messages differ (C4)", () => {
    const bundle = capture(step);
    const actual = {
      ...matchingActual,
      inputs: {
        ...matchingActual.inputs,
        messages: [{ role: "user", content: "different" }],
      },
    };
    const r = verify(bundle, actual);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.includes("messages_sha256"))).toBe(true);
  });

  test("fails when tools_sha256 is present in bundle but tools missing in actual", () => {
    const tools = [{ name: "search" }];
    const bundle = capture({ ...step, inputs: { ...step.inputs, tools } });
    const r = verify(bundle, matchingActual);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.includes("tools_sha256"))).toBe(true);
  });

  test("passes when tools match", () => {
    const tools = [{ name: "search", schema: { type: "object" } }];
    const bundle = capture({ ...step, inputs: { ...step.inputs, tools } });
    const actual = { ...matchingActual, inputs: { ...matchingActual.inputs, tools } };
    const r = verify(bundle, actual);
    expect(r.verified).toBe(true);
  });

  test("fails when transcript differs (TranscriptHashMismatch)", () => {
    const bundle = capture(step);
    const actual = { ...matchingActual, output: { transcript: { foo: "bar" } } };
    const r = verify(bundle, actual);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes("transcript"))).toBe(true);
  });

  test("fails on schema-invalid bundle", () => {
    const r = verify({ rerun_version: "0.2", garbage: true } as unknown, matchingActual);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes("schema"))).toBe(true);
  });

  test("fails on schema-invalid actual", () => {
    const bundle = capture(step);
    const r = verify(bundle, { wrong: "shape" } as unknown);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes("schema"))).toBe(true);
  });

  test("returns UnsupportedTolerance for structural", () => {
    // Build a structural-tolerance bundle (schema accepts it).
    const bundle = capture(step);
    const structuralBundle = { ...bundle, tolerance: { level: "structural" as const } };
    const r = verify(structuralBundle, matchingActual);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.includes("UnsupportedTolerance"))).toBe(true);
  });

  test("passes when a signed bundle's signature is valid", () => {
    const kp = generateKeyPair();
    const bundle = capture(step, { signingKey: kp.privateKey });
    const r = verify(bundle, matchingActual);
    expect(r.verified).toBe(true);
  });

  test("fails with BadSignature when a signed bundle is mutated (C3)", () => {
    const kp = generateKeyPair();
    const bundle = capture(step, { signingKey: kp.privateKey });
    const tampered = {
      ...bundle,
      sampling: { ...bundle.sampling, temperature: 0.7 },
    };
    const r = verify(tampered, matchingActual);
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.includes("BadSignature"))).toBe(true);
  });
});

describe("verify (semantic tolerance)", () => {
  // 4-dim "embeddings" are sufficient to exercise cosine math.
  const expectedEmbedding = new Float32Array([1, 0, 0, 0]);
  const matchingEmbedding = new Float32Array([0.9, 0.1, 0, 0]); // cosine ≈ 0.994
  const farEmbedding = new Float32Array([0, 1, 0, 0]); // cosine = 0
  const wrongDimEmbedding = new Float32Array([1, 0, 0]);

  function semanticStep(): StepRecord {
    return {
      ...step,
      expected: { semantic_embedding: encode(expectedEmbedding) },
      tolerance: { level: "semantic", threshold: 0.95 },
    };
  }

  function actualWithEmbedding(e: Float32Array): ActualRecord {
    return {
      inputs: matchingActual.inputs,
      output: { embedding: encode(e) },
    };
  }

  test("passes when cosine ≥ threshold", () => {
    const bundle = capture(semanticStep());
    const r = verify(bundle, actualWithEmbedding(matchingEmbedding));
    expect(r.verified).toBe(true);
  });

  test("fails with SemanticBelowThreshold when cosine < threshold", () => {
    const bundle = capture(semanticStep());
    const r = verify(bundle, actualWithEmbedding(farEmbedding));
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.includes("SemanticBelowThreshold"))).toBe(true);
  });

  test("fails with EmbeddingDimensionMismatch on dim mismatch", () => {
    const bundle = capture(semanticStep());
    const r = verify(bundle, actualWithEmbedding(wrongDimEmbedding));
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.includes("EmbeddingDimensionMismatch"))).toBe(true);
  });

  test("fails when actual is missing an embedding", () => {
    const bundle = capture(semanticStep());
    const r = verify(bundle, {
      inputs: matchingActual.inputs,
      output: {},
    });
    expect(r.verified).toBe(false);
    expect(r.errors.some((e) => e.toLowerCase().includes("embedding"))).toBe(true);
  });
});

function encode(v: Float32Array): string {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString("base64");
}

describe("verify (SPEC §6 — fingerprint drift)", () => {
  const stepFp: StepRecord = {
    ...step,
    model: { ...step.model, fingerprint: "fp_bundle_abc" },
  };

  test("emits FingerprintDrift warning when actual reports a different fingerprint", () => {
    const bundle = capture(stepFp);
    const r = verify(bundle, {
      ...matchingActual,
      runtime: { fingerprint: "fp_actual_xyz" },
    });
    expect(r.warnings.some((w) => w.includes("FingerprintDrift"))).toBe(true);
    // Drift alone does not flip `verified`; the tolerance check decides.
    expect(r.verified).toBe(true);
  });

  test("no warning when fingerprints match", () => {
    const bundle = capture(stepFp);
    const r = verify(bundle, {
      ...matchingActual,
      runtime: { fingerprint: "fp_bundle_abc" },
    });
    expect(r.warnings).toEqual([]);
  });

  test("no warning when bundle has no fingerprint or actual has no runtime", () => {
    const bundleNoFp = capture(step);
    const r1 = verify(bundleNoFp, {
      ...matchingActual,
      runtime: { fingerprint: "fp_actual_xyz" },
    });
    expect(r1.warnings).toEqual([]);
    const r2 = verify(capture(stepFp), matchingActual);
    expect(r2.warnings).toEqual([]);
  });
});
