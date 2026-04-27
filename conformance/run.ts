/**
 * Run every fixture under `conformance/vectors/` against `verify`.
 *
 * Pass: actual verify result matches `expected.json` (verified flag + every substring
 * in `expected.errorContains` appears in some result error).
 * Fail: any mismatch.
 *
 * Run: `bun run conformance/run.ts`
 */
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { verify } from "../src/verify.ts";

const ROOT = new URL("./vectors/", import.meta.url).pathname;

type Expected = {
  description?: string;
  verified: boolean;
  errorContains?: string[];
  warningContains?: string[];
};

const start = Date.now();
let failed = 0;
let total = 0;

for (const name of readdirSync(ROOT).sort()) {
  const dir = join(ROOT, name);
  if (!statSync(dir).isDirectory()) continue;
  total++;
  const bundle = JSON.parse(await Bun.file(join(dir, "bundle.rr")).text());
  const actual = JSON.parse(await Bun.file(join(dir, "actual.json")).text());
  const expected = JSON.parse(await Bun.file(join(dir, "expected.json")).text()) as Expected;
  const result = verify(bundle, actual);
  const issues = checkExpectations(expected, result);
  if (issues.length === 0) {
    console.log(`pass  ${name}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}`);
    for (const i of issues) console.log(`        ${i}`);
    console.log(`      got: ${JSON.stringify(result)}`);
  }
}

const ms = Date.now() - start;
console.log(`\n${total - failed}/${total} pass (${ms} ms)`);
if (failed > 0) process.exit(1);

function checkExpectations(
  expected: Expected,
  actual: { verified: boolean; errors: string[]; warnings: string[] },
): string[] {
  const issues: string[] = [];
  if (actual.verified !== expected.verified) {
    issues.push(`expected verified=${expected.verified}, got verified=${actual.verified}`);
  }
  for (const needle of expected.errorContains ?? []) {
    if (!actual.errors.some((e) => e.includes(needle))) {
      issues.push(`expected an error containing "${needle}", got [${actual.errors.join(", ")}]`);
    }
  }
  for (const needle of expected.warningContains ?? []) {
    if (!actual.warnings.some((w) => w.includes(needle))) {
      issues.push(`expected a warning containing "${needle}", got [${actual.warnings.join(", ")}]`);
    }
  }
  return issues;
}
