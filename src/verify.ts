import { cosine, decodeEmbedding } from "./cosine.ts";
import { sha256OfJcs } from "./hash.ts";
import { ActualRecordSchema, BundleSchema } from "./schema.ts";
import { verifyBundleSignature } from "./sign.ts";

export type VerifyResult = {
  verified: boolean;
  errors: string[];
  warnings: string[];
};

/** Verify an actual record against a bundle per the bundle's tolerance level. */
export function verify(bundle: unknown, actual: unknown): VerifyResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const bp = BundleSchema.safeParse(bundle);
  if (!bp.success) {
    return { verified: false, errors: [`SchemaViolation:bundle: ${bp.error.message}`], warnings };
  }
  const ap = ActualRecordSchema.safeParse(actual);
  if (!ap.success) {
    return { verified: false, errors: [`SchemaViolation:actual: ${ap.error.message}`], warnings };
  }

  const b = bp.data;
  const a = ap.data;

  // Signature (C3): if present, mutating any other field invalidates it.
  if (b.signature) {
    const sigCheck = verifyBundleSignature(b);
    if (!sigCheck.valid) errors.push(`BadSignature:${sigCheck.reason ?? "invalid"}`);
  }

  // Input hashes (C4 et al.)
  if (sha256OfJcs(a.inputs.system_prompt) !== b.inputs.system_prompt_sha256) {
    errors.push("InputHashMismatch:system_prompt_sha256");
  }
  if (sha256OfJcs(a.inputs.messages) !== b.inputs.messages_sha256) {
    errors.push("InputHashMismatch:messages_sha256");
  }
  if (b.inputs.tools_sha256 !== undefined) {
    if (a.inputs.tools === undefined) {
      errors.push("InputHashMismatch:tools_sha256");
    } else if (sha256OfJcs(a.inputs.tools) !== b.inputs.tools_sha256) {
      errors.push("InputHashMismatch:tools_sha256");
    }
  }

  // Tolerance check.
  switch (b.tolerance.level) {
    case "byte": {
      // Schema guarantees expected.transcript_sha256 is set.
      if (a.output.transcript === undefined) {
        errors.push("TranscriptHashMismatch:actual.output.transcript missing");
      } else if (sha256OfJcs(a.output.transcript) !== b.expected.transcript_sha256) {
        errors.push("TranscriptHashMismatch");
      }
      break;
    }
    case "semantic": {
      // Schema guarantees expected.semantic_embedding and tolerance.threshold are set.
      if (!a.output.embedding) {
        errors.push("MissingEmbedding:actual.output.embedding required for semantic tolerance");
        break;
      }
      const exp = decodeEmbedding(b.expected.semantic_embedding as string);
      const act = decodeEmbedding(a.output.embedding);
      if (exp.length !== act.length) {
        errors.push(`EmbeddingDimensionMismatch:expected ${exp.length}, got ${act.length}`);
        break;
      }
      const sim = cosine(exp, act);
      const threshold = b.tolerance.threshold as number;
      if (sim < threshold) {
        errors.push(`SemanticBelowThreshold:cosine=${sim.toFixed(4)},threshold=${threshold}`);
      }
      break;
    }
    case "structural":
      errors.push("UnsupportedTolerance:structural");
      break;
  }

  return { verified: errors.length === 0, errors, warnings };
}
