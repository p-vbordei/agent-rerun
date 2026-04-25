#!/usr/bin/env bun
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
  const step = StepRecordSchema.parse(JSON.parse(await Bun.file(stepPath).text())) as StepRecord;
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
  const bundle = JSON.parse(await Bun.file(bundlePath).text());
  const actual = JSON.parse(await Bun.file(actualPath).text());
  const result = verify(bundle, actual);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.verified ? 0 : 1);
}

async function loadPrivateKey(path: string): Promise<Uint8Array> {
  const content = JSON.parse(await Bun.file(path).text()) as { privateKey: string };
  return new Uint8Array(Buffer.from(content.privateKey, "base64"));
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
