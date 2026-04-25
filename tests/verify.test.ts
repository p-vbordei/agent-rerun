import { describe, expect, test } from "bun:test";
import { capture } from "../src/capture.ts";
import type { ActualRecord, StepRecord } from "../src/schema.ts";
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
});
