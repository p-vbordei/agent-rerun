# agent-rerun — v0.1 specification (DRAFT)

**Status:** draft, not yet implemented.

## Abstract

`agent-rerun` defines a portable JSON bundle that pins the inputs, sampling parameters, and expected output of a single AI-agent step. Given the bundle and the original inputs, any compatible runtime should reproduce the output within a declared tolerance.

## 1. Terminology

- **Step** — one LLM request/response, possibly including tool calls and results.
- **Bundle** — the JSON envelope pinning inputs + params + expected output + signature.
- **Tolerance** — the strictness level used when comparing replay output to expected output.

## 2. Bundle schema

```
{
  "rerun_version": "0.1",
  "model": {
    "vendor": "anthropic" | "openai" | "google" | "local-vllm" | ...,
    "id": "<model id>",                       // e.g. "claude-opus-4-7"
    "fingerprint?": "<vendor system fingerprint>"
  },
  "sampling": {
    "temperature": <number>,
    "top_p": <number>,
    "seed?": <int>,
    "max_tokens?": <int>
  },
  "inputs": {
    "system_prompt_sha256": "sha256:...",
    "messages_sha256": "sha256:...",           // over JCS(messages)
    "tools_sha256?": "sha256:..."              // over JCS(tool schemas)
  },
  "runtime": {
    "class": "cloud" | "local-vllm" | "local-transformers",
    "tool_versions?": { "python": "3.12.3", ... }
  },
  "expected": {
    "transcript_sha256?": "sha256:...",        // over scroll-canonical bytes
    "semantic_embedding?": "<base64 float32>"  // for semantic comparison
  },
  "tolerance": {
    "level": "byte" | "semantic" | "structural",
    "threshold?": <number>                     // e.g. 0.98 for cosine similarity
  },
  "signature?": {
    "alg": "ed25519",
    "pubkey": "<base64>",
    "sig": "<base64>"                          // over JCS(bundle minus signature)
  }
}
```

## 3. Tolerance levels

- **`byte`** — `actual.transcript_sha256 == expected.transcript_sha256`. Only achievable for `temperature=0` on deterministic runtimes.
- **`semantic`** — `cosine(embed(actual), embed(expected)) >= threshold`. Requires an agreed embedder (spec: `sentence-transformers/all-MiniLM-L6-v2` default; bundle MAY name another via `ext`).
- **`structural`** — tool-call graph matches (same tools called in same order, same arg hashes), but message bodies may differ. Weakest tolerance; useful when bodies are high-temp prose.

## 4. Operations

### 4.1 Capture

```
rerun capture <scroll.json> -o bundle.rr
```

Reads a canonical scroll, extracts the first/single step, computes hashes, optionally computes `semantic_embedding`, and writes the bundle.

### 4.2 Apply

```
rerun apply bundle.rr --runtime=openai
```

Re-executes the step against the configured runtime and emits a new transcript.

### 4.3 Verify

```
rerun verify bundle.rr actual.json
```

Compares `actual.json` against `bundle.expected` using `bundle.tolerance`. Exit code 0 on pass, 1 on fail. Prints per-rule verdict.

## 5. Security considerations

- **Signatures are advisory**, not authoritative. A signed bundle tells you who claims these expected outputs; it does not guarantee the model will produce them.
- **Fingerprint drift**: when `model.fingerprint` differs on replay, verifiers SHOULD warn but MAY still pass if tolerance is `semantic` or `structural`.
- **Tamper detection**: mutating bundle bytes invalidates the signature (if present). The hashes inside protect input integrity independently of the signature.
- **Determinism is best-effort** across vendors. `byte` tolerance is expected to fail cross-vendor; that is a feature, not a bug.

## 6. Conformance

A conforming implementation MUST:

- (C1) Capture a bundle from a canonical scroll; verify a byte-level replay (same runtime, `temperature=0`) passes.
- (C2) Verify a semantic replay across runtimes passes when cosine ≥ threshold.
- (C3) Verify MUST fail when bundle bytes are mutated (signature invalid).
- (C4) Verify MUST fail when `inputs.messages_sha256` does not match the actual messages supplied to the runtime.

Test vectors live in `conformance/`.

## 7. References

- [`agent-scroll` spec](../agent-scroll/SPEC.md)
- [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785)
- [SLSA v1.0 provenance](https://slsa.dev/spec/v1.0/provenance)
- ["Defeating Nondeterminism in LLM Inference" (Thinking Machines, Sep 2025)](https://thinkingmachines.ai/)
