# Changelog

All notable changes to `agent-rerun` are documented here. The project uses [Semantic Versioning](https://semver.org). The **format version** (`rerun_version` inside a bundle) and the **package version** are tracked independently.

| Package version | Format version | Date |
|---|---|---|
| 0.1.0 | rerun.json v0.1 | 2026-04-25 |

## [0.1.0] — 2026-04-25

Initial release. Format + TypeScript reference implementation + conformance vectors + demo.

### Format (`rerun.json` v0.1) — see [SPEC.md](./SPEC.md)

- Bundle schema with `model`, `sampling`, `inputs`, `runtime`, `expected`, `tolerance`, optional `signature`.
- All hashes and signatures over [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785) bytes.
- Tolerance levels: `byte`, `semantic`. The `structural` enum value is reserved (returns `UnsupportedTolerance` in v0.1; required in v0.2).
- Optional Ed25519 signatures over `JCS(bundle without "signature")`. Signatures are deterministic per [RFC 8032](https://www.rfc-editor.org/rfc/rfc8032).
- Normative actual-record shape in SPEC §5 (closes the C4 underspecification).
- Embedder fixed to `sentence-transformers/all-MiniLM-L6-v2` (384-dim float32, base64-encoded). The undefined `ext` field referenced in earlier drafts has been removed.

### Reference implementation

- TypeScript + Bun, ~600 LoC across 9 source files (none over 200 lines).
- Public API: `capture`, `verify`, `signBundle`, `verifyBundleSignature`, `generateKeyPair`, `cosine`, `encodeEmbedding`, `decodeEmbedding`, plus the schemas and types.
- CLI: `rerun capture` and `rerun verify`. JCS-canonical bundle output (byte-deterministic). Single binary via `bun build --compile`.
- 69 unit tests + 8 conformance vectors. Full suite under 500 ms; conformance under 30 ms.

### Conformance — see [conformance/](./conformance/)

Eight vectors covering all four SPEC §7 conformance clauses plus four bonus negatives:

- C1 — byte replay passes.
- C2 — semantic replay passes.
- C3 — mutated bundle bytes rejected.
- C4 — messages-hash mismatch rejected.
- below-threshold cosine, embedding-dim mismatch, structural-unsupported, schema-violation.

### Deferred to v0.2

- `apply` (vendor-adapter re-execution).
- `structural` tolerance level.
- JSON Schema export for non-TS implementations.

### Removed from earlier drafts

- The `ext` escape hatch on `tolerance` (referenced in earlier SPEC §3 with no corresponding schema field).

### Notes

- **Strict on extras.** The bundle and actual-record schemas reject unknown fields (SPEC §2). Tolerating extras silently was a conformance risk: two implementations encoding the same conceptual bundle could produce different JCS bytes and therefore different signatures. Forward-compatible additions are introduced via `rerun_version` bumps, not by smuggling unknown fields into v0.1 bundles.

- **Fingerprint drift is a warning, not an error.** When `bundle.model.fingerprint` and `actual.runtime.fingerprint` are both set and differ, `verify` emits a `FingerprintDrift:bundle=<fp>,actual=<fp>` warning. The flag is informational; the tolerance check decides `verified`. The actual-record schema gained an optional `runtime.fingerprint` field for this purpose; SPEC §6 was upgraded from "SHOULD warn" to a normative MUST-warn for the reference implementation. Conformance vector: `fingerprint-drift-warning`.

[0.1.0]: ./CHANGELOG.md#010--2026-04-25
