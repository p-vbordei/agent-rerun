import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPair } from "../src/sign.ts";

const cliPath = new URL("../src/cli.ts", import.meta.url).pathname;

let dir = "";

const step = {
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  sampling: { temperature: 0, top_p: 1 },
  inputs: { system_prompt: "x", messages: [{ role: "user", content: "hello" }] },
  runtime: { class: "cloud" },
  expected: { transcript: { messages: [{ role: "assistant", content: "hi" }] } },
  tolerance: { level: "byte" },
};

const matchingActual = {
  inputs: { system_prompt: "x", messages: [{ role: "user", content: "hello" }] },
  output: { transcript: { messages: [{ role: "assistant", content: "hi" }] } },
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "rerun-cli-"));
});

afterAll(() => {
  // Bun's test runner cleans temp dirs on exit; nothing to do.
});

async function runCli(
  args: string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", cliPath, ...args], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  await proc.exited;
  return { exitCode: proc.exitCode ?? -1, stdout, stderr };
}

describe("CLI: capture", () => {
  test("writes a bundle to -o path", async () => {
    const stepPath = join(dir, "step.json");
    const bundlePath = join(dir, "bundle.rr");
    writeFileSync(stepPath, JSON.stringify(step));
    const r = await runCli(["capture", stepPath, "-o", bundlePath]);
    expect(r.exitCode).toBe(0);
    const written = JSON.parse(await Bun.file(bundlePath).text());
    expect(written.rerun_version).toBe("0.1");
    expect(written.signature).toBeUndefined();
  });

  test("writes a signed bundle when --key is given", async () => {
    const kp = generateKeyPair();
    const keyPath = join(dir, "key.json");
    const stepPath = join(dir, "step-signed.json");
    const bundlePath = join(dir, "bundle-signed.rr");
    writeFileSync(
      keyPath,
      JSON.stringify({ privateKey: Buffer.from(kp.privateKey).toString("base64") }),
    );
    writeFileSync(stepPath, JSON.stringify(step));
    const r = await runCli(["capture", stepPath, "-o", bundlePath, "--key", keyPath]);
    expect(r.exitCode).toBe(0);
    const written = JSON.parse(await Bun.file(bundlePath).text());
    expect(written.signature?.alg).toBe("ed25519");
  });
});

describe("CLI: verify", () => {
  test("exit 0 on a matching pair", async () => {
    const stepPath = join(dir, "step-v.json");
    const bundlePath = join(dir, "bundle-v.rr");
    const actualPath = join(dir, "actual-v.json");
    writeFileSync(stepPath, JSON.stringify(step));
    writeFileSync(actualPath, JSON.stringify(matchingActual));
    await runCli(["capture", stepPath, "-o", bundlePath]);
    const r = await runCli(["verify", bundlePath, actualPath]);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout).verified).toBe(true);
  });

  test("exit 1 when messages differ (C4)", async () => {
    const stepPath = join(dir, "step-c4.json");
    const bundlePath = join(dir, "bundle-c4.rr");
    const actualPath = join(dir, "actual-c4.json");
    writeFileSync(stepPath, JSON.stringify(step));
    writeFileSync(
      actualPath,
      JSON.stringify({
        inputs: { system_prompt: "x", messages: [{ role: "user", content: "DIFFERENT" }] },
        output: { transcript: matchingActual.output.transcript },
      }),
    );
    await runCli(["capture", stepPath, "-o", bundlePath]);
    const r = await runCli(["verify", bundlePath, actualPath]);
    expect(r.exitCode).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.verified).toBe(false);
    expect(out.errors.some((e: string) => e.includes("messages_sha256"))).toBe(true);
  });

  test("exit 1 when a signed bundle is mutated (C3)", async () => {
    const kp = generateKeyPair();
    const keyPath = join(dir, "key-c3.json");
    const stepPath = join(dir, "step-c3.json");
    const bundlePath = join(dir, "bundle-c3.rr");
    const actualPath = join(dir, "actual-c3.json");
    writeFileSync(
      keyPath,
      JSON.stringify({ privateKey: Buffer.from(kp.privateKey).toString("base64") }),
    );
    writeFileSync(stepPath, JSON.stringify(step));
    writeFileSync(actualPath, JSON.stringify(matchingActual));
    await runCli(["capture", stepPath, "-o", bundlePath, "--key", keyPath]);
    // Mutate sampling.temperature in place.
    const bundle = JSON.parse(await Bun.file(bundlePath).text());
    bundle.sampling.temperature = 0.7;
    writeFileSync(bundlePath, JSON.stringify(bundle));
    const r = await runCli(["verify", bundlePath, actualPath]);
    expect(r.exitCode).toBe(1);
    expect(JSON.parse(r.stdout).errors.some((e: string) => e.includes("BadSignature"))).toBe(true);
  });
});

describe("CLI: usage", () => {
  test("no args → prints usage and exits non-zero", async () => {
    const r = await runCli([]);
    expect(r.exitCode).not.toBe(0);
    expect((r.stderr + r.stdout).toLowerCase()).toContain("usage");
  });

  test("unknown command → prints usage and exits non-zero", async () => {
    const r = await runCli(["floob"]);
    expect(r.exitCode).not.toBe(0);
  });
});

describe("CLI: error handling", () => {
  test("missing input file → friendly error mentioning the path", async () => {
    const r = await runCli(["verify", "/nope/bundle.rr", "/nope/actual.json"]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain("/nope/bundle.rr");
    expect(r.stderr.toLowerCase()).toMatch(/(not found|cannot read|enoent)/);
  });

  test("invalid JSON in bundle → friendly error mentioning the path", async () => {
    const bundlePath = join(dir, "bad-bundle.rr");
    const actualPath = join(dir, "ok-actual.json");
    writeFileSync(bundlePath, "{not json");
    writeFileSync(actualPath, JSON.stringify(matchingActual));
    const r = await runCli(["verify", bundlePath, actualPath]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(bundlePath);
    expect(r.stderr.toLowerCase()).toContain("json");
  });

  test("invalid step record → friendly error, not a raw Zod dump", async () => {
    const stepPath = join(dir, "bad-step.json");
    const bundlePath = join(dir, "should-not-exist.rr");
    writeFileSync(stepPath, "{}");
    const r = await runCli(["capture", stepPath, "-o", bundlePath]);
    expect(r.exitCode).not.toBe(0);
    expect(r.stderr).toContain(stepPath);
    expect(r.stderr.toLowerCase()).toContain("invalid step record");
  });
});

describe("CLI: capture is byte-deterministic", () => {
  test("two captures of the same step produce byte-identical files", async () => {
    const stepPath = join(dir, "step-det.json");
    const a = join(dir, "a.rr");
    const b = join(dir, "b.rr");
    writeFileSync(stepPath, JSON.stringify(step));
    await runCli(["capture", stepPath, "-o", a]);
    await runCli(["capture", stepPath, "-o", b]);
    const ab = await Bun.file(a).text();
    const bb = await Bun.file(b).text();
    expect(ab).toBe(bb);
  });
});
