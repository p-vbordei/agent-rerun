/**
 * Wiring `@huggingface/transformers` MiniLM-L6-v2 as the embedder for semantic tolerance.
 *
 * `@huggingface/transformers` is NOT a runtime dependency of agent-rerun. Install
 * it only if you want a turnkey embedder:
 *   `bun add @huggingface/transformers`
 *
 * The agent-rerun library does no embedding itself; both bundle.expected.semantic_embedding
 * and actual.output.embedding are precomputed by the caller and compared by `verify`.
 */
// @ts-expect-error — optional dependency, see header.
import { pipeline } from "@huggingface/transformers";
import { capture, encodeEmbedding, verify } from "../src/index.ts";

const embed = await pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2");

async function embedText(s: string): Promise<string> {
  const out = await embed(s, { pooling: "mean", normalize: true });
  return encodeEmbedding(new Float32Array(out.data));
}

const inputs = {
  system_prompt: "answer concisely",
  messages: [{ role: "user", content: "what is the capital of France?" }],
};

const expectedTranscript = "the capital of France is Paris";
const actualTranscript = "Paris is the capital of France";

const bundle = capture({
  model: { vendor: "anthropic", id: "claude-opus-4-7" },
  sampling: { temperature: 0.7, top_p: 1 },
  inputs,
  runtime: { class: "cloud" },
  expected: { semantic_embedding: await embedText(expectedTranscript) },
  tolerance: { level: "semantic", threshold: 0.95 },
});

const actual = {
  inputs,
  output: { embedding: await embedText(actualTranscript) },
};

console.log(verify(bundle, actual));
