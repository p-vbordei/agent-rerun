# agent-rerun conformance suite

Standalone test vectors any implementation can validate against.

## Run

```bash
bun run conformance        # via package.json script
# or
bun run conformance/run.ts
```

Pass on success (exit 0), fail on any mismatch (exit 1). Total run is ~30 ms.

## Contents

- `vectors/<name>/bundle.rr` — JCS-canonical bundle bytes.
- `vectors/<name>/actual.json` — actual record supplied to `verify`.
- `vectors/<name>/expected.json` — expected verify outcome (`verified`, `errorContains[]`, plus a human description).
- `keys/test-key.json` — fixed Ed25519 key used to sign fixtures. **Test-only.**
- `gen.ts` — regenerates fixtures from source. Deterministic (fixed key + JCS + RFC 8032).
- `run.ts` — walks `vectors/`, runs `verify`, compares against `expected.json`.

## Coverage

| Vector | SPEC clause | Behavior |
|---|---|---|
| `c1-byte-replay-passes` | C1 | Signed bundle + matching actual + byte tolerance → pass. |
| `c2-semantic-replay-passes` | C2 | Signed bundle + cosine ≥ threshold → pass. |
| `c3-mutated-bundle-rejected` | C3 | Edited `sampling.temperature` after signing → fail with BadSignature. |
| `c4-messages-mismatch-rejected` | C4 | Actual carries different messages → fail with InputHashMismatch. |
| `c2-below-threshold-rejected` | (bonus) | Cosine 0.0 vs threshold 0.95 → fail with SemanticBelowThreshold. |
| `embedding-dim-mismatch-rejected` | (bonus) | 4-dim expected vs 3-dim actual → fail with EmbeddingDimensionMismatch. |
| `structural-unsupported` | (bonus, MAY) | tolerance.level === "structural" → fail with UnsupportedTolerance (v0.2 makes structural required). |
| `schema-violation-rerun-version` | (bonus) | Wrong `rerun_version` → fail with SchemaViolation. |
| `strictness-extra-bundle-field` | SPEC §2 strictness | Unknown top-level field in bundle → fail with SchemaViolation. |
| `strictness-extra-inputs-field` | SPEC §2 strictness | Unknown field nested in `inputs` (e.g. a hash-shaped field) → fail with SchemaViolation. |
| `fingerprint-drift-warning` | SPEC §6 | `bundle.model.fingerprint` differs from `actual.runtime.fingerprint`; semantic tolerance passes; verify emits a `FingerprintDrift` warning. |

## Adding a vector

1. Edit `gen.ts` and add a `writeVector(name, …)` call.
2. Run `bun run conformance/gen.ts` to write the files.
3. Run `bun run conformance` to confirm.
4. Commit `gen.ts`, `vectors/<name>/`, and any new key under `keys/`.

## Cross-implementation use

A non-TS implementation can verify it conforms to v0.1 by:

1. Reading `bundle.rr` and `actual.json` for each vector.
2. Running its own `verify` implementation.
3. Comparing the result to `expected.json` — `verified` flag plus every substring in `errorContains[]` must appear in some error.

`bundle.rr` files are byte-for-byte canonical (JCS), so independent implementations can also use them as round-trip canonicalization fixtures (re-encode and assert byte-identical output).
