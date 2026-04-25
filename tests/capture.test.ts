import { describe, expect, test } from "bun:test";
import { capture } from "../src/capture.ts";
import { sha256OfJcs } from "../src/hash.ts";
import { BundleSchema } from "../src/schema.ts";

const baseStep = {
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  sampling: { temperature: 0, top_p: 1, seed: 42 },
  inputs: {
    system_prompt: "you are a helpful assistant",
    messages: [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi there" },
    ],
  },
  runtime: { class: "cloud" as const },
};

describe("capture", () => {
  test("produces a bundle that conforms to the schema (byte tolerance)", () => {
    const bundle = capture({
      ...baseStep,
      expected: { transcript: { messages: [{ role: "assistant", content: "hi" }] } },
      tolerance: { level: "byte" },
    });
    expect(BundleSchema.safeParse(bundle).success).toBe(true);
    expect(bundle.rerun_version).toBe("0.1");
  });

  test("hashes inputs correctly", () => {
    const bundle = capture({
      ...baseStep,
      expected: { transcript: { foo: "bar" } },
      tolerance: { level: "byte" },
    });
    expect(bundle.inputs.system_prompt_sha256).toBe(sha256OfJcs(baseStep.inputs.system_prompt));
    expect(bundle.inputs.messages_sha256).toBe(sha256OfJcs(baseStep.inputs.messages));
    expect(bundle.inputs.tools_sha256).toBeUndefined();
  });

  test("hashes tools when present", () => {
    const tools = [{ name: "search", schema: { type: "object" } }];
    const bundle = capture({
      ...baseStep,
      inputs: { ...baseStep.inputs, tools },
      expected: { transcript: { foo: "bar" } },
      tolerance: { level: "byte" },
    });
    expect(bundle.inputs.tools_sha256).toBe(sha256OfJcs(tools));
  });

  test("hashes the expected transcript for byte tolerance", () => {
    const transcript = { messages: [{ role: "assistant", content: "hi" }] };
    const bundle = capture({
      ...baseStep,
      expected: { transcript },
      tolerance: { level: "byte" },
    });
    expect(bundle.expected.transcript_sha256).toBe(sha256OfJcs(transcript));
  });

  test("forwards a precomputed embedding for semantic tolerance", () => {
    const embedding = "AAAAAAAAAAAAAAAAAAAAAA==";
    const bundle = capture({
      ...baseStep,
      expected: { semantic_embedding: embedding },
      tolerance: { level: "semantic", threshold: 0.95 },
    });
    expect(bundle.expected.semantic_embedding).toBe(embedding);
    expect(bundle.tolerance.threshold).toBe(0.95);
  });

  test("preserves optional fields (fingerprint, max_tokens, tool_versions)", () => {
    const bundle = capture({
      model: { vendor: "openai", id: "gpt-4o", fingerprint: "fp_abc" },
      sampling: { temperature: 0.7, top_p: 0.9, max_tokens: 1024 },
      inputs: { system_prompt: "x", messages: [] },
      runtime: { class: "cloud", tool_versions: { python: "3.12.3" } },
      expected: { transcript: {} },
      tolerance: { level: "byte" },
    });
    expect(bundle.model.fingerprint).toBe("fp_abc");
    expect(bundle.sampling.max_tokens).toBe(1024);
    expect(bundle.runtime.tool_versions).toEqual({ python: "3.12.3" });
  });

  test("rejects a step record missing required fields", () => {
    expect(() =>
      capture({
        // @ts-expect-error — intentionally invalid
        model: { vendor: "anthropic" },
        sampling: { temperature: 0, top_p: 1 },
        inputs: { system_prompt: "x", messages: [] },
        runtime: { class: "cloud" },
        expected: { transcript: {} },
        tolerance: { level: "byte" },
      }),
    ).toThrow();
  });

  test("does not include a signature when no signing key is given", () => {
    const bundle = capture({
      ...baseStep,
      expected: { transcript: {} },
      tolerance: { level: "byte" },
    });
    expect(bundle.signature).toBeUndefined();
  });
});
