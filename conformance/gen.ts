/**
 * Generate the canonical conformance fixtures.
 *
 * Run: `bun run conformance/gen.ts`
 *
 * Produces:
 *   conformance/keys/test-key.json
 *   conformance/vectors/<name>/{bundle.rr, actual.json, expected.json}
 *
 * Fixtures are deterministic — the key is fixed, the bundle is JCS-canonical,
 * and Ed25519 signatures are deterministic per RFC 8032. Re-running gen.ts
 * over the same source produces byte-identical fixture files.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as ed25519 from "@noble/ed25519";
import { capture } from "../src/capture.ts";
import { encodeEmbedding } from "../src/cosine.ts";
import { jcsBytes } from "../src/jcs.ts";
import type { Bundle, StepRecord } from "../src/schema.ts";

// Fixed test key (DO NOT USE FOR ANYTHING REAL).
const TEST_PRIVATE_KEY = new Uint8Array(32).fill(1);
const TEST_PUBLIC_KEY = ed25519.getPublicKey(TEST_PRIVATE_KEY);

const ROOT = new URL("./", import.meta.url).pathname;
const VECTORS = join(ROOT, "vectors");
const KEYS = join(ROOT, "keys");

mkdirSync(VECTORS, { recursive: true });
mkdirSync(KEYS, { recursive: true });

writeFileSync(
  join(KEYS, "test-key.json"),
  `${JSON.stringify(
    {
      privateKey: Buffer.from(TEST_PRIVATE_KEY).toString("base64"),
      publicKey: Buffer.from(TEST_PUBLIC_KEY).toString("base64"),
      note: "Fixed test key used to generate deterministic conformance fixtures. NEVER use for production.",
    },
    null,
    2,
  )}\n`,
);

const baseStep: StepRecord = {
  model: { vendor: "anthropic", id: "claude-opus-4-7", fingerprint: "fp_test" },
  sampling: { temperature: 0, top_p: 1, seed: 42 },
  inputs: {
    system_prompt: "you are a helpful assistant",
    messages: [
      { role: "user", content: "say hi" },
      { role: "assistant", content: "hi" },
    ],
  },
  runtime: { class: "cloud", tool_versions: { python: "3.12.3" } },
  expected: { transcript: { messages: [{ role: "assistant", content: "hi" }] } },
  tolerance: { level: "byte" },
};

const baseActual = {
  inputs: {
    system_prompt: baseStep.inputs.system_prompt,
    messages: baseStep.inputs.messages,
  },
  output: { transcript: baseStep.expected.transcript },
};

// 4-dim "embeddings" used in semantic vectors.
const expectedEmbedding = encodeEmbedding(new Float32Array([1, 0, 0, 0]));
const matchingEmbedding = encodeEmbedding(new Float32Array([0.99, 0.05, 0.05, 0]));
const farEmbedding = encodeEmbedding(new Float32Array([0, 1, 0, 0]));
const wrongDimEmbedding = encodeEmbedding(new Float32Array([1, 0, 0]));

writeVector("c1-byte-replay-passes", {
  bundle: capture(baseStep, { signingKey: TEST_PRIVATE_KEY }),
  actual: baseActual,
  expected: { verified: true, errorContains: [] },
  description:
    "C1: signed bundle with byte tolerance. The actual record reproduces the inputs and transcript. Verify must pass.",
});

writeVector("c2-semantic-replay-passes", {
  bundle: capture(
    {
      ...baseStep,
      expected: { semantic_embedding: expectedEmbedding },
      tolerance: { level: "semantic", threshold: 0.95 },
    },
    { signingKey: TEST_PRIVATE_KEY },
  ),
  actual: { ...baseActual, output: { embedding: matchingEmbedding } },
  expected: { verified: true, errorContains: [] },
  description:
    "C2: semantic tolerance, threshold 0.95. The actual embedding's cosine with the expected is ≥ 0.95. Verify must pass.",
});

writeVector("c3-mutated-bundle-rejected", {
  bundle: mutateField(capture(baseStep, { signingKey: TEST_PRIVATE_KEY }), (b) => {
    b.sampling.temperature = 0.7;
  }),
  actual: baseActual,
  expected: { verified: false, errorContains: ["BadSignature"] },
  description:
    "C3: signed bundle whose `sampling.temperature` was edited from 0 to 0.7 after signing. Verify must fail with BadSignature.",
});

writeVector("c4-messages-mismatch-rejected", {
  bundle: capture(baseStep, { signingKey: TEST_PRIVATE_KEY }),
  actual: {
    ...baseActual,
    inputs: {
      ...baseActual.inputs,
      messages: [{ role: "user", content: "DIFFERENT MESSAGE" }],
    },
  },
  expected: { verified: false, errorContains: ["InputHashMismatch:messages_sha256"] },
  description:
    "C4: actual record carries different `messages` than the bundle attests. Verify must fail with InputHashMismatch.",
});

writeVector("c2-below-threshold-rejected", {
  bundle: capture(
    {
      ...baseStep,
      expected: { semantic_embedding: expectedEmbedding },
      tolerance: { level: "semantic", threshold: 0.95 },
    },
    { signingKey: TEST_PRIVATE_KEY },
  ),
  actual: { ...baseActual, output: { embedding: farEmbedding } },
  expected: { verified: false, errorContains: ["SemanticBelowThreshold"] },
  description:
    "Semantic tolerance with cosine = 0 (orthogonal). Below threshold (0.95). Verify must fail with SemanticBelowThreshold.",
});

writeVector("embedding-dim-mismatch-rejected", {
  bundle: capture(
    {
      ...baseStep,
      expected: { semantic_embedding: expectedEmbedding },
      tolerance: { level: "semantic", threshold: 0.95 },
    },
    { signingKey: TEST_PRIVATE_KEY },
  ),
  actual: { ...baseActual, output: { embedding: wrongDimEmbedding } },
  expected: { verified: false, errorContains: ["EmbeddingDimensionMismatch"] },
  description:
    "Bundle's expected embedding is 4-dim; actual's is 3-dim. Verify must fail with EmbeddingDimensionMismatch.",
});

writeVector("structural-unsupported", {
  bundle: { ...capture(baseStep), tolerance: { level: "structural" } },
  actual: baseActual,
  expected: { verified: false, errorContains: ["UnsupportedTolerance"] },
  description:
    "tolerance.level === 'structural'. v0.1 reference implementations return UnsupportedTolerance.",
});

writeVector("schema-violation-rerun-version", {
  bundle: { ...capture(baseStep), rerun_version: "0.2" } as unknown,
  actual: baseActual,
  expected: { verified: false, errorContains: ["SchemaViolation"] },
  description:
    "Bundle has the wrong rerun_version. Verify must fail with SchemaViolation before any tolerance check.",
});

writeVector("strictness-extra-bundle-field", {
  bundle: { ...capture(baseStep, { signingKey: TEST_PRIVATE_KEY }), MYSTERY: "extra" } as unknown,
  actual: baseActual,
  expected: { verified: false, errorContains: ["SchemaViolation"] },
  description:
    "Bundle carries an unknown top-level field. Per SPEC §2 strictness, verify must fail with SchemaViolation rather than silently strip it.",
});

writeVector("strictness-extra-inputs-field", {
  bundle: ((): unknown => {
    const b = capture(baseStep, { signingKey: TEST_PRIVATE_KEY });
    return { ...b, inputs: { ...b.inputs, fake_sha256: `sha256:${"0".repeat(64)}` } };
  })(),
  actual: baseActual,
  expected: { verified: false, errorContains: ["SchemaViolation"] },
  description:
    "Bundle carries an unknown field inside `inputs` (e.g. an attacker adds a hash-shaped field). Verify must fail with SchemaViolation.",
});

// SPEC §6 — fingerprint drift. Use semantic tolerance so that drift does not also
// trigger a transcript-hash mismatch; the warning surfaces alongside `verified: true`.
writeVector("fingerprint-drift-warning", {
  bundle: capture(
    {
      ...baseStep,
      expected: { semantic_embedding: expectedEmbedding },
      tolerance: { level: "semantic", threshold: 0.95 },
    },
    { signingKey: TEST_PRIVATE_KEY },
  ),
  actual: {
    ...baseActual,
    output: { embedding: matchingEmbedding },
    runtime: { fingerprint: "fp_replay_different" },
  },
  expected: {
    verified: true,
    errorContains: [],
    warningContains: ["FingerprintDrift"],
  },
  description:
    "SPEC §6: bundle.model.fingerprint is `fp_test`; actual.runtime.fingerprint is `fp_replay_different`. Verify passes on semantic tolerance and emits a FingerprintDrift warning.",
});

console.log(`generated fixtures in ${VECTORS}`);

type Vector = {
  bundle: unknown;
  actual: unknown;
  expected: {
    verified: boolean;
    errorContains: string[];
    warningContains?: string[];
  };
  description: string;
};

function writeVector(name: string, v: Vector) {
  const dir = join(VECTORS, name);
  mkdirSync(dir, { recursive: true });
  // Bundles use JCS-canonical bytes; actual + expected use indented JSON for readability.
  writeFileSync(join(dir, "bundle.rr"), jcsBytes(v.bundle));
  writeFileSync(join(dir, "actual.json"), `${JSON.stringify(v.actual, null, 2)}\n`);
  writeFileSync(
    join(dir, "expected.json"),
    `${JSON.stringify({ description: v.description, ...v.expected }, null, 2)}\n`,
  );
}

function mutateField(bundle: Bundle, mutator: (b: Bundle) => void): Bundle {
  // Deep-clone via JSON to avoid mutating the source.
  const cloned = JSON.parse(JSON.stringify(bundle)) as Bundle;
  mutator(cloned);
  return cloned;
}
