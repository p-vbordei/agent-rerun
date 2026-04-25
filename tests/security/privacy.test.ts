import { describe, expect, test } from "bun:test";
import { capture } from "../../src/capture.ts";
import { jcsBytes } from "../../src/jcs.ts";

describe("SPEC §6 — Privacy", () => {
  test("a captured bundle does not contain plaintext input strings", () => {
    const secret = "PROPRIETARY-SYSTEM-PROMPT-DO-NOT-LEAK";
    const apiKey = "sk-secret-tool-key-9999";
    const bundle = capture({
      model: { vendor: "anthropic", id: "claude-opus-4-7" },
      sampling: { temperature: 0, top_p: 1 },
      inputs: {
        system_prompt: secret,
        messages: [{ role: "user", content: secret }],
        tools: [{ name: "search", apiKey }],
      },
      runtime: { class: "cloud" },
      expected: { transcript: { messages: [{ role: "assistant", content: secret }] } },
      tolerance: { level: "byte" },
    });

    // The bundle's canonical bytes are what gets persisted/transmitted.
    const onTheWire = new TextDecoder().decode(jcsBytes(bundle));

    expect(onTheWire.includes(secret)).toBe(false);
    expect(onTheWire.includes(apiKey)).toBe(false);
  });
});
