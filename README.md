# agent-rerun

> **Portable reproducibility seed bundle for AI-agent steps.** SLSA for agent steps — capture once, verify on any compatible runtime within a declared tolerance.

[![release: v0.1.0](https://img.shields.io/badge/release-v0.1.0-brightgreen)](./CHANGELOG.md) [![spec: v0.1 stable](https://img.shields.io/badge/spec-v0.1%20stable-blue)](./SPEC.md) [![license: Apache 2.0](https://img.shields.io/badge/license-Apache%202.0-green)](./LICENSE)

OpenAI's `seed` is best-effort. vLLM determinism is runtime-specific. SLSA proves builds, not LLM outputs. LangSmith replay is proprietary. There is no vendor-agnostic envelope for an LLM step's inputs, params, and expected output that you can sign, share, and verify on a different runtime within a declared tolerance.

`agent-rerun` is that envelope. One JSON file, one binary, four runtime dependencies. No vendor SDK, no SaaS, no daemon.

```ts
import { capture, verify } from "agent-rerun";

// Capture a bundle from a step record (model, params, inputs, expected output).
const bundle = await capture(stepRecord, { signingKey });

// Verify a fresh run matches within the bundle's tolerance.
const result = await verify(bundle, actualRecord);
console.log(result.verified ? "match" : result.errors);
```

---

## Contents

- [What you get](#what-you-get)
- [Why this exists](#why-this-exists)
- [The bundle](#the-bundle)
- [Tolerance levels](#tolerance-levels)
- [Operations](#operations)
- [Quickstart](#quickstart)
- [Use cases](#use-cases)
- [Where it fits in the agent family](#where-it-fits-in-the-agent-family)
- [Roadmap](#roadmap)
- [Prior art](#prior-art)
- [Spec and conformance](#spec-and-conformance)
- [License](#license)

---

## What you get

| Deliverable | What | Where |
|---|---|---|
| Format spec | Normative `rerun.json` v0.1 schema, hashing, signing, tolerance rules | [SPEC.md](./SPEC.md) |
| Reference library | TypeScript + Bun, ~600 LoC, four runtime dependencies | [src/](./src) |
| CLI | `rerun capture` and `rerun verify`, single binary via `bun build --compile` | [src/cli.ts](./src/cli.ts) |
| Conformance vectors | Eight golden tests covering C1–C4 and four bonus negatives, run in <30 ms | [conformance/](./conformance/) |
| Demo | 19-line capture → mutate → verify-fails | [examples/demo.ts](./examples/demo.ts) |
| MiniLM example | Optional pattern for wiring `@huggingface/transformers` as the embedder | [examples/with-minilm.ts](./examples/with-minilm.ts) |

No vendor lock. No external services. The bundle is a self-contained file.

---

## Why this exists

Cross-vendor LLM replay is a real, unmet need: regression catching, audit, vendor migration, bug bisection. Existing tools each address a slice but none assemble the slice into a portable artifact:

- **OpenAI `seed` + `system_fingerprint`** — best-effort, vendor-specific. No bundle, no cross-vendor schema.
- **vLLM determinism** — `VLLM_ENFORCE_EAGER=1`, fixed batch size, same GPU arch. Runtime config, not a transport format.
- **LangSmith replay** — proprietary; locked to the LangChain SDK.
- **MLflow / W&B Artifacts** — training-shaped, not LLM-step-shaped.
- **Nix flakes** — perfect build pinning, zero LLM sampling semantics.
- **SLSA provenance v1.0** — closest shape; proves *what built what*, not *what an LLM returned*.
- **Thinking Machines (Sep 2025)** — batch-invariant kernels at the kernel layer; no transport format.

`agent-rerun` is the missing transport format: a vendor-agnostic JSON envelope that bundles sampling params, content hashes, expected output, tolerance policy, and signature. Same role as SLSA provenance — just for one LLM call instead of one build.

---

## The bundle

```json
{
  "rerun_version": "0.1",
  "model": {
    "vendor": "anthropic",
    "id": "claude-opus-4-7",
    "fingerprint": "fp_abc123"
  },
  "sampling": {
    "temperature": 0,
    "top_p": 1,
    "seed": 42,
    "max_tokens": 4096
  },
  "inputs": {
    "system_prompt_sha256": "sha256:7d8e2f...",
    "messages_sha256":      "sha256:b3c1ad...",
    "tools_sha256":         "sha256:42aa01..."
  },
  "runtime": {
    "class": "cloud",
    "tool_versions": { "python": "3.12.3" }
  },
  "expected": {
    "transcript_sha256":  "sha256:91ee7a...",
    "semantic_embedding": "<base64 float32, 384 dims>"
  },
  "tolerance": {
    "level":     "semantic",
    "threshold": 0.98
  },
  "signature": {
    "alg":    "ed25519",
    "pubkey": "<base64>",
    "sig":    "<base64 over JCS(bundle minus signature)>"
  }
}
```

**Optional fields:** `model.fingerprint`, `sampling.seed`, `sampling.max_tokens`, `inputs.tools_sha256`, `runtime.tool_versions`, both fields under `expected`, `tolerance.threshold`, the entire `signature` block. See [SPEC §2](./SPEC.md#2-bundle-schema).

**Bytes are stable.** All canonical encoding follows [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785). Hashes are computed over the JCS bytes of their source. The signature covers JCS of the bundle with `signature` removed.

**Hashes hide content.** The bundle stores hashes of inputs, not the inputs themselves. Publish a bundle for audit without leaking system prompts or tool args.

---

## Tolerance levels

| Level | Check | When to use | Status |
|---|---|---|---|
| **`byte`** | `expected.transcript_sha256 == sha256(JCS(actual.transcript))` | Same runtime, `temperature=0`, deterministic backend (e.g. vLLM with batch-invariant kernels). | v0.1 |
| **`semantic`** | `cosine(expected.semantic_embedding, actual.embedding) ≥ threshold` | Cross-vendor / cross-runtime replay. Both sides carry precomputed embeddings (same embedder). | v0.1 |
| **`structural`** | Tool-call graph: same tools called in same order with same `args_hash`. | High-temperature prose where bodies vary but the tool plan must match. | v0.2 |

**Verify is pure math.** The library does not ship an embedder. The bundle's `semantic_embedding` is precomputed at capture time and `actual.json` carries its own. A 10-line MiniLM wiring lives in `examples/with-minilm.ts` (at v0.1.0) for callers that want a turnkey embedder.

---

## Operations

### `capture` — turn a step record into a bundle

```bash
rerun capture step.json -o bundle.rr
```

`step.json` is one LLM step (`{ model, sampling, inputs, expected }`). `capture` JCS-canonicalizes the inputs, computes SHA-256 hashes, packages the bundle, and (optionally) signs with Ed25519.

### `verify` — check an actual run against the bundle

```bash
rerun verify bundle.rr actual.json
```

Exit code `0` on pass, `1` on fail. Prints per-rule verdict: schema, signature, input hashes, tolerance comparison.

### `apply` — re-execute a step

Deferred to v0.2. The bundle stores hashes only (no plaintext inputs), so re-execution needs both the bundle and the original inputs. Most callers do this in five lines with their vendor SDK; an `apply` wrapper would add vendor-adapter glue without solving a problem the SDK doesn't already solve. See [SCOPE.md](./SCOPE.md) for the rationale.

---

## Quickstart

```bash
# 1. Install
bun install

# 2. Run the demo (capture → tamper → verify fails)
bun examples/demo.ts

# 3. Run conformance
bun run conformance
```

Three commands. No services, no API keys, no Docker. To install as a dependency in another project: `bun add agent-rerun` (after publishing).

---

## Use cases

- **Regression replay in CI.** Capture a step at commit A; the same inputs on commit B must verify within tolerance, or the build fails. Catches silent drift from prompt edits, tool-version bumps, or upstream model changes.
- **Cross-vendor parity tests.** A bundle from Anthropic with `tolerance: semantic, threshold: 0.95` should verify against OpenAI on the same inputs. If it doesn't, you have a vendor-equivalence gap.
- **Audit trails.** A signed bundle is a portable, content-addressed claim: "I ran this step with these params and got this output." Auditors verify without seeing the inputs.
- **Bug bisection.** Mutate one input field at a time; verify must fail on the field that matters. The bundle is your minimum-reproduction harness.
- **Vendor-migration gating.** Maintain a bundle library; when changing vendors, run the bundles against the new vendor and gate the migration on the verify-pass rate.

---

## Where it fits in the agent family

`agent-rerun` is one repo in an 8-repo family of agent-native primitives. Each repo solves one problem; they compose via SHA-256, JCS, and Ed25519.

| Repo | Role | Relationship |
|---|---|---|
| [`agent-scroll`](../agent-scroll) | Canonical conversation transcript | `expected.transcript_sha256` is the hash of a scroll. `actual.json` is a (partial) scroll. |
| [`agent-id`](../agent-id) | DID + capability VC | Optional. `signature.pubkey` is an Ed25519 verification method on an `agent-id` DID. |
| [`agent-toolprint`](../agent-toolprint) | Signed tool-call receipts | Companion. Toolprints prove tool calls *happened*; rerun proves the step *can be replayed*. |
| [`agent-cid`](../agent-cid) | Content-addressed manifest | Optional — bundles can be referenced by CID for distribution. |

No new crypto, no new wire format. Everything composes primitives already in the family.

---

## Roadmap

| Phase | Deliverables | Status |
|---|---|---|
| **0.0 — design** | Spec draft, README, scope sheet | shipped |
| **0.1 — reference impl** | TS + Bun library, CLI, conformance vectors, demo | shipped (this release) |
| **0.2** | `apply` (vendor adapters), `structural` tolerance, JSON Schema export | planned |
| **1.0** | Public conformance authority once external implementations land | awaiting adoption |

**v0.1 IN / DEFERRED / CUT:** [SCOPE.md](./SCOPE.md). **Release notes:** [CHANGELOG.md](./CHANGELOG.md).

**Sizing:** 9 source files, none over 200 lines. Four runtime dependencies: `zod`, `@noble/hashes`, `@noble/ed25519`, `canonicalize`. 69 unit tests + 8 conformance vectors. Full suite under 500 ms.

---

## Prior art

| Project | What it is | Why it doesn't replace agent-rerun |
|---|---|---|
| OpenAI `seed` + `system_fingerprint` | Best-effort determinism flags | Vendor-specific; no bundle, no cross-vendor schema. |
| vLLM determinism | Runtime config | No transport format. |
| LangSmith replay | Trace-replay SDK | Proprietary; locked to LangChain. |
| MLflow / W&B Artifacts | Run + artifact lineage | Training-shaped, not LLM-step-shaped. |
| Nix flakes | Build input pinning | No LLM sampling semantics. |
| SLSA provenance v1.0 | Build attestation | Builds, not LLM outputs — but the closest shape. |
| Thinking Machines (Sep 2025) | Batch-invariant kernels | Runtime-level fix, no transport format. |

Full landscape: [`research/`](../research/).

---

## Spec and conformance

- [**SPEC.md**](./SPEC.md) — normative v0.1.
- [**SCOPE.md**](./SCOPE.md) — v0.1 IN / DEFERRED / CUT.
- [**conformance/**](./conformance/) — golden vectors covering C1–C4 plus four bonus negatives.
- [**CHANGELOG.md**](./CHANGELOG.md) — release log.

A conforming implementation MUST:

| | Clause |
|---|---|
| **C1** | Capture a bundle from a step record; verify a byte-level replay (same runtime, `temperature=0`) passes. |
| **C2** | Verify a semantic replay across runtimes when cosine ≥ threshold. |
| **C3** | Reject mutated bundle bytes (signature invalid). |
| **C4** | Reject when `inputs.messages_sha256` does not match the messages actually supplied. |

---

## License

Apache 2.0 — see [LICENSE](./LICENSE).

---

## Background and research

Landscape, scoring, prior art: [`research/`](../research/).
This repo's validation: [`research/validations/agent-rerun.md`](../research/validations/agent-rerun.md) — score 28/30, verdict EASY.
