import { describe, expect, test } from "bun:test";
import { type ActualRecord, type Bundle, type StepRecord, capture, verify } from "../src/index.ts";

describe("public API", () => {
  test("capture and verify are reachable from index, with type aliases exported", () => {
    const step: StepRecord = {
      model: { vendor: "anthropic", id: "claude-opus-4-7" },
      sampling: { temperature: 0, top_p: 1 },
      inputs: { system_prompt: "x", messages: [] },
      runtime: { class: "cloud" },
      expected: { transcript: { foo: "bar" } },
      tolerance: { level: "byte" },
    };
    const bundle: Bundle = capture(step);
    const actual: ActualRecord = {
      inputs: { system_prompt: "x", messages: [] },
      output: { transcript: { foo: "bar" } },
    };
    const r = verify(bundle, actual);
    expect(r.verified).toBe(true);
  });
});
