# agent-rerun — v0.1 Scope

Stage 1 output. Each candidate feature gets: real first-party caller, primary-use-case-dies test, reinvention check, verdict.

Default is DEFERRED. Inclusion requires either (a) an existing first-party caller in the `agent-*` family, or (b) the primary use case dies without it.

---

## IN-V0.1

### F1. Bundle schema (Zod) — `rerun.json` v0.1
- First-party caller: every `verify` and `capture` call; non-TS implementations reading the format.
- Dies without it: yes — the schema IS the artifact.
- Reinvents: no (Zod for runtime validation; JSON Schema export deferred).

### F2. JCS canonicalization (RFC 8785)
- First-party caller: every hash and every signature path.
- Dies without it: yes — without canonical encoding, "byte-identical" is meaningless.
- Reinvents: no (`canonicalize` npm).

### F3. SHA-256 input hashing (`system_prompt_sha256`, `messages_sha256`, optional `tools_sha256`)
- First-party caller: capture writer + verify reader.
- Dies without it: yes — C4 is a hash-mismatch test.
- Reinvents: no (`@noble/hashes`).

### F4. Ed25519 sign / verify (optional `signature` field)
- First-party caller: C3 conformance fixture; any signed-bundle producer in the family.
- Dies without it: C3 is untestable without it (mutation detection on `expected.*` or `tolerance.*` requires a signature).
- Reinvents: no (`@noble/ed25519`).

### F5. `capture(stepRecord, opts?) → Bundle` library API
- First-party caller: every author of a bundle.
- Dies without it: yes — C1 starts here.
- Reinvents: no.

### F6. `verify(bundle, actual, opts?) → VerifyResult` library API (byte + semantic tolerances)
- First-party caller: every relying party; conformance harness.
- Dies without it: yes — verify IS the value-prop.
- Reinvents: no.
- Note: **verify is pure math.** `actual.json` carries its own embedding for semantic comparison. The library does not ship an embedder.

### F7. CLI: `rerun capture` and `rerun verify` (single binary via `bun build --compile`)
- First-party caller: contributors writing/checking conformance vectors; the demo.
- Dies without it: yes — bare library makes the "spec + ref impl + conformance" promise needlessly hard to consume.
- Reinvents: no.

### F8. Conformance vectors `conformance/*.json` covering C1–C4 + run script (<30s, one command)
- First-party caller: this repo IS the conformance authority for the format.
- Dies without it: yes — vectors are the product.
- Reinvents: no.

### F9. Demo (`examples/demo.ts`, ≤20 lines, one command)
- First-party caller: the sales pitch.
- Dies without it: yes — demos beat docs.
- Reinvents: no.

### F10. Normative `actual record` shape (in SPEC §5 and Zod)
- First-party caller: `verify` and every conformance vector.
- Dies without it: yes — C4 is otherwise underspecified ("the messages actually supplied" with no shape definition).
- Reinvents: no (mirrors `bundle.inputs` plus an `output` block).

---

## DEFERRED-TO-V0.2

### D1. `apply bundle.rr --runtime=<vendor>` — re-execute against a vendor runtime
- First-party caller: none in the family today.
- Dies without it: no — `verify` is the core artifact.
- Why deferred: the bundle stores hashes only (no plaintext inputs), so `apply` needs both the bundle AND the original inputs. At that point, a 5-line vendor SDK call is simpler than a vendor-adapter shim. Vendor SDKs are the mature primitive; reinventing them violates the "compose mature primitives" rule.

### D2. `structural` tolerance level (tool-call graph match)
- First-party caller: none in the family today; no Cn requires it.
- Dies without it: no — SPEC §3 defines it but §7 does not test it in v0.1.
- Why deferred: schema accepts `"structural"` as a value; `verify` returns `unsupported` until v0.2. Reconsider when a caller (likely `agent-toolprint`) needs it.

### D3. Bundled embedder (MiniLM via `@huggingface/transformers`)
- First-party caller: capture-time embedding + actual-time embedding.
- Dies without it: no — the verify path is pure cosine math when both sides carry precomputed embeddings.
- Why deferred: `@huggingface/transformers` is ~30MB plus a WASM model download. Adding it for a feature `verify` does not need violates "Light deps". `examples/with-minilm.ts` will be a 10-liner that callers can copy if they want a turnkey embedder.

### D4. JSON Schema export of the bundle (for non-TS implementations)
- First-party caller: none today (no non-TS impl in the family).
- Dies without it: no — Zod-to-JSON-Schema is mechanical when needed.
- Why deferred: add when a non-TS implementation appears.

---

## CUT

### X1. Vendor-specific runtime adapters (OpenAI / Anthropic / vLLM clients)
- Anti-scope. Vendor SDKs are the mature primitive; we don't reinvent them. If a caller needs an "apply" wrapper, they bring their own SDK.

### X2. HTTP server / verify-as-a-service
- Every caller imports the library directly. Wrappers are v0.2 fodder, and even then "verify-as-a-service" needs a stronger justification than "users sometimes don't want to install Bun".

### X3. Plugin / extension architecture for new tolerance levels
- KISS violation. The tolerance level enum is closed in the SPEC. New levels are SPEC changes, not plugin slots.

### X4. Configurable embedder via an `ext` field on the bundle
- SPEC §3 originally referenced an `ext` field that does not exist in §2. Removed in this scope: v0.1 fixes the embedder to MiniLM-L6-v2 and the `ext` reference is dropped from the SPEC. Reconsider when a caller defines a real alternative embedder.

### X5. Bundle storage / object-store integration
- Anti-scope. Bundles are tiny JSON files; users store them however they want (filesystem, S3, IPFS via `agent-cid`, …). Not the format's job.

### X6. CLI flags for tolerance overrides at verify time
- Bundle's `tolerance` is authoritative; overriding at verify time invalidates the attestation. No caller needs it.

### X7. Bundle versioning / migration tooling
- v0.1 is the first version. Migration tooling shows up at v0.2 if and when the format breaks.

---

## Design calls

### Language: TypeScript + Bun
The validation skeleton sketched Python (`pydantic`, `cryptography`, `numpy`). The build-prompt language table mandates TypeScript + Bun as default; Python is allowed only with an explicit "huggingface/pydantic gravity" argument. The verify path does not need an embedder runtime, so there is no ML gravity. **TS + Bun overrides the validation's Python sketch.**

### Verify is pure math
The library does not ship an embedder. The bundle's `expected.semantic_embedding` is precomputed at capture time; the actual record's `output.embedding` is precomputed by the caller at execution time. `verify` does cosine and SHA-256 comparisons only. This keeps runtime deps to four packages and lets conformance vectors run in <30s without downloading a model.

### Apply is out of v0.1
The bundle is the attestation, not the executor. Apply is convenience glue. Defer.

### Signatures are required to make C3 testable
SPEC says `signature` is optional in the schema. C3 requires that "mutating bundle bytes makes verify fail (signature invalid)". So C3 fixtures use signed bundles, and the library implements Ed25519 sign/verify in v0.1.

### `actual record` shape is normative in v0.1
The SPEC originally referenced "the actual messages supplied to the runtime" without defining the shape. v0.1 SPEC §5 defines it: `{ inputs: { system_prompt, messages, tools? }, output: { transcript?, embedding? } }`.

### Embedder is fixed in v0.1
v0.1 fixes the embedder to `sentence-transformers/all-MiniLM-L6-v2` (384-dim float32). The `ext` field referenced in the original SPEC §3 is removed (it had no schema). v0.2 may add an `embedder_id` field if a caller appears with a real alternative.

### No DSL, no plugins, no config
A `rerun.json` is a plain JSON file. The CLI takes paths and flags; nothing else. Tolerance is bundle-authoritative and not overridable at verify time.

---

## Runtime dependencies (v0.1 library)

- `@noble/ed25519` — Ed25519 signatures
- `@noble/hashes` — SHA-256
- `canonicalize` — RFC 8785 JCS
- `zod` — runtime validation of bundle and actual record shapes

Four packages. No HTTP framework. No JSON-LD. No embedder. No vendor SDKs.

---

## Sizing target

~600 LoC of source + ~25 conformance fixtures. CLI is one file (~80 LoC). Library is `src/index.ts` plus `src/{schema,jcs,sign,capture,verify}.ts` — six files, each well under 200 lines.
