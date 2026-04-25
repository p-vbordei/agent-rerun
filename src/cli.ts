#!/usr/bin/env bun
import type { z } from "zod";
import { capture } from "./capture.ts";
import { jcsBytes } from "./jcs.ts";
import { type StepRecord, StepRecordSchema } from "./schema.ts";
import { verify } from "./verify.ts";

const USAGE = `agent-rerun v0.1

Usage:
  rerun capture <step.json> -o <bundle.rr> [--key <key.json>]
    Read a step record, write a bundle. With --key, sign with the Ed25519 private key in the file (JSON: { "privateKey": "<base64>" }).

  rerun verify <bundle.rr> <actual.json>
    Verify the actual record against the bundle. Exit 0 on pass, 1 on fail.
    Prints a JSON result: { verified, errors, warnings }.
`;

main().catch((e) => {
  process.stderr.write(`${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  switch (cmd) {
    case "capture":
      await captureCmd(rest);
      break;
    case "verify":
      await verifyCmd(rest);
      break;
    default:
      process.stderr.write(USAGE);
      process.exit(1);
  }
}

async function captureCmd(args: string[]) {
  const opts = parseArgs(args, ["-o", "--key"]);
  const stepPath = opts._positional[0];
  const outPath = opts.flags["-o"];
  const keyPath = opts.flags["--key"];
  if (!stepPath || !outPath) {
    process.stderr.write(USAGE);
    process.exit(1);
  }
  const stepJson = await loadJson(stepPath, "step record");
  const stepResult = StepRecordSchema.safeParse(stepJson);
  if (!stepResult.success) {
    throw new Error(`invalid step record at ${stepPath}: ${formatZodError(stepResult.error)}`);
  }
  const step: StepRecord = stepResult.data;
  const signingKey = keyPath ? await loadPrivateKey(keyPath) : undefined;
  const bundle = capture(step, { signingKey });
  await Bun.write(outPath, jcsBytes(bundle));
}

async function verifyCmd(args: string[]) {
  const [bundlePath, actualPath] = args;
  if (!bundlePath || !actualPath) {
    process.stderr.write(USAGE);
    process.exit(1);
  }
  const bundle = await loadJson(bundlePath, "bundle");
  const actual = await loadJson(actualPath, "actual record");
  const result = verify(bundle, actual);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.verified ? 0 : 1);
}

async function loadJson(path: string, label: string): Promise<unknown> {
  let text: string;
  try {
    text = await Bun.file(path).text();
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`cannot read ${label} at ${path}: ${reason}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    throw new Error(`invalid JSON in ${label} at ${path}: ${reason}`);
  }
}

async function loadPrivateKey(path: string): Promise<Uint8Array> {
  const content = (await loadJson(path, "key file")) as { privateKey?: string };
  if (typeof content.privateKey !== "string") {
    throw new Error(`key file at ${path} is missing a base64 \`privateKey\` field`);
  }
  return new Uint8Array(Buffer.from(content.privateKey, "base64"));
}

function formatZodError(err: z.ZodError): string {
  return err.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("; ");
}

type ParsedArgs = {
  _positional: string[];
  flags: Record<string, string>;
};

function parseArgs(argv: string[], flags: string[]): ParsedArgs {
  const out: ParsedArgs = { _positional: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (flags.includes(a)) {
      const next = argv[i + 1];
      if (next === undefined) throw new Error(`flag ${a} requires a value`);
      out.flags[a] = next;
      i++;
    } else {
      out._positional.push(a);
    }
  }
  return out;
}
