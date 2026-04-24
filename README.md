# agent-rerun

> Portable reproducibility seed bundle for AI-agent steps.

## What

`agent-rerun` is a tiny JSON envelope that pins everything needed to replay an agent step on another runtime: temperature, top-p, seed, model id + version hash, tool versions, system prompt hash, context hash, and an expected output (byte or semantic).

It is **SLSA for agent steps**. Given a bundle + the original input, any runtime of the same class should produce an output that matches within a declared tolerance.

## Status

**0.0 — design phase.** Draft spec in [SPEC.md](./SPEC.md). No code yet.

## The gap

OpenAI's `seed` + `system_fingerprint` is best-effort and vendor-specific. vLLM determinism docs cover runtime config but no transport format. LangSmith replay is proprietary. MLflow / W&B Artifacts are training-shaped. Nix flakes pin builds but have no LLM sampling semantics. SLSA provenance proves *what built what*, not *what an LLM returned*.

No vendor-agnostic envelope bundles sampling params + content hashes + tolerance policy + signature so a bundle from Anthropic can be verified on OpenAI / vLLM / local.

## Scope

**In scope**

- Bundle JSON schema (`rerun.json` v0.1)
- Content hashing for system prompt, messages, tools
- Sampling + model + fingerprint fields
- Tolerance policy (`byte`, `semantic`, `structural` with thresholds)
- Signature (Ed25519)
- Capture / apply / verify CLI

**Out of scope**

- Guaranteeing byte-determinism across vendors (not possible today)
- Full model redistribution
- A testing framework (this is the data format)

## Dependencies and companions

- **Depends on:** `agent-scroll` (the `expected.transcript_sha256` points at a scroll), optionally `agent-id` (for signed bundles).
- **Companion to:** `agent-toolprint` (tool-call receipts for the step), `agent-scroll` (transcript format).

## Validation scoring

| Criterion | Score |
|---|---|
| Scope | 5 |
| Composes primitives | 5 |
| Standalone | 5 |
| Clear gap | 4 |
| Light deps | 5 |
| Testable | 4 |
| **Total** | **28/30** |

Verdict: **EASY**. Full validation: [`../research/validations/agent-rerun.md`](../research/validations/agent-rerun.md).

## Prior art

- **OpenAI `seed` + `system_fingerprint`** — limited, vendor-specific.
- **vLLM determinism** — runtime config, no transport format.
- **LangSmith replay** — proprietary.
- **MLflow / W&B Artifacts** — ML-training shaped.
- **Nix flakes** — perfect build pinning, no LLM semantics.
- **SLSA provenance v1** — closest shape; builds, not LLM outputs.
- **"Thinking Machines — Defeating Nondeterminism in LLM Inference" (Sep 2025)** — batch-invariant kernels; runtime-level.

## Implementation skeleton

**Bundle (`rerun.json` v0.1):**

```json
{
  "rerun_version": "0.1",
  "model": { "vendor": "anthropic", "id": "claude-opus-4-7", "fingerprint": "..." },
  "sampling": { "temperature": 0, "top_p": 1, "seed": 42, "max_tokens": 4096 },
  "inputs": {
    "system_prompt_sha256": "...",
    "messages_sha256": "...",
    "tools_sha256": "..."
  },
  "runtime": {
    "tool_versions": { "python": "3.12.3" },
    "class": "cloud | local-vllm"
  },
  "expected": {
    "transcript_sha256": "...",
    "semantic_embedding": "base64"
  },
  "tolerance": { "level": "byte | semantic | structural", "threshold": 0.98 },
  "signature": { "alg": "ed25519", "pubkey": "...", "sig": "..." }
}
```

**CLI:**

- `rerun capture <trace.json> -o bundle.rr`
- `rerun apply bundle.rr --runtime=openai`
- `rerun verify bundle.rr actual.json`

**Dependencies:** `pydantic`, `cryptography`, `numpy` (cosine similarity only).

**Repo sizing:** ~800 LoC + 40 fixtures.

## Conformance tests

1. Byte-level replay of `temperature=0` deterministic runs.
2. Semantic replay across vendors via embedding cosine ≥ threshold.
3. Tamper detection — mutate bundle bytes, verify MUST fail.

## License

Apache 2.0 — see [LICENSE](./LICENSE).

## Research

Landscape, prior art, scoring rationale: [`../research/`](../research/).
