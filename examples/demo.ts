/**
 * agent-rerun demo: capture → tamper → verify fails. Run with `bun examples/demo.ts`.
 */
import { capture, generateKeyPair, verify } from "../src/index.ts";

const kp = generateKeyPair();

const step = {
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  sampling: { temperature: 0, top_p: 1 },
  inputs: { system_prompt: "you are helpful", messages: [{ role: "user", content: "hi" }] },
  runtime: { class: "cloud" as const },
  expected: { transcript: { messages: [{ role: "assistant", content: "hello" }] } },
  tolerance: { level: "byte" as const },
};

const actual = { inputs: step.inputs, output: { transcript: step.expected.transcript } };

const bundle = capture(step, { signingKey: kp.privateKey });
console.log("original  →", verify(bundle, actual).verified ? "PASS" : "FAIL");

const tampered = { ...bundle, sampling: { ...bundle.sampling, temperature: 0.7 } };
const r = verify(tampered, actual);
console.log("tampered  →", r.verified ? "PASS" : `FAIL (${r.errors[0]})`);
