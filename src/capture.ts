import { sha256OfJcs } from "./hash.ts";
import { type Bundle, BundleSchema, type StepRecord, StepRecordSchema } from "./schema.ts";

/** Build a `rerun.json` v0.1 bundle from a step record. */
export function capture(input: StepRecord): Bundle {
  const step = StepRecordSchema.parse(input);

  const bundle: Bundle = {
    rerun_version: "0.1",
    model: step.model,
    sampling: step.sampling,
    inputs: {
      system_prompt_sha256: sha256OfJcs(step.inputs.system_prompt),
      messages_sha256: sha256OfJcs(step.inputs.messages),
      ...(step.inputs.tools !== undefined && {
        tools_sha256: sha256OfJcs(step.inputs.tools),
      }),
    },
    runtime: step.runtime,
    expected: {
      ...(step.expected.transcript !== undefined && {
        transcript_sha256: sha256OfJcs(step.expected.transcript),
      }),
      ...(step.expected.semantic_embedding !== undefined && {
        semantic_embedding: step.expected.semantic_embedding,
      }),
    },
    tolerance: step.tolerance,
  };

  return BundleSchema.parse(bundle);
}
