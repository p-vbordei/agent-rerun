import { z } from "zod";

const Sha256Hex = z.string().regex(/^sha256:[0-9a-f]{64}$/, "expected sha256:<64-hex>");

export const BundleSchema = z
  .object({
    rerun_version: z.literal("0.1"),
    model: z.object({
      vendor: z.string().min(1),
      id: z.string().min(1),
      fingerprint: z.string().optional(),
    }),
    sampling: z.object({
      temperature: z.number(),
      top_p: z.number(),
      seed: z.number().int().optional(),
      max_tokens: z.number().int().positive().optional(),
    }),
    inputs: z.object({
      system_prompt_sha256: Sha256Hex,
      messages_sha256: Sha256Hex,
      tools_sha256: Sha256Hex.optional(),
    }),
    runtime: z.object({
      class: z.enum(["cloud", "local-vllm", "local-transformers"]),
      tool_versions: z.record(z.string()).optional(),
    }),
    expected: z.object({
      transcript_sha256: Sha256Hex.optional(),
      semantic_embedding: z.string().optional(),
    }),
    tolerance: z.object({
      level: z.enum(["byte", "semantic", "structural"]),
      threshold: z.number().optional(),
    }),
    signature: z
      .object({
        alg: z.literal("ed25519"),
        pubkey: z.string().min(1),
        sig: z.string().min(1),
      })
      .optional(),
  })
  .superRefine((b, ctx) => {
    if (b.tolerance.level === "byte" && !b.expected.transcript_sha256) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expected", "transcript_sha256"],
        message: "byte tolerance requires expected.transcript_sha256",
      });
    }
    if (b.tolerance.level === "semantic") {
      if (!b.expected.semantic_embedding) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["expected", "semantic_embedding"],
          message: "semantic tolerance requires expected.semantic_embedding",
        });
      }
      if (b.tolerance.threshold === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tolerance", "threshold"],
          message: "semantic tolerance requires tolerance.threshold",
        });
      }
    }
  });

export const ActualRecordSchema = z.object({
  inputs: z.object({
    system_prompt: z.string(),
    messages: z.array(z.unknown()),
    tools: z.array(z.unknown()).optional(),
  }),
  output: z.object({
    transcript: z.unknown().optional(),
    embedding: z.string().optional(),
  }),
});

/** Input to `capture()`: plaintext inputs + the rest of the bundle's surface. */
export const StepRecordSchema = z.object({
  model: z.object({
    vendor: z.string().min(1),
    id: z.string().min(1),
    fingerprint: z.string().optional(),
  }),
  sampling: z.object({
    temperature: z.number(),
    top_p: z.number(),
    seed: z.number().int().optional(),
    max_tokens: z.number().int().positive().optional(),
  }),
  inputs: z.object({
    system_prompt: z.string(),
    messages: z.array(z.unknown()),
    tools: z.array(z.unknown()).optional(),
  }),
  runtime: z.object({
    class: z.enum(["cloud", "local-vllm", "local-transformers"]),
    tool_versions: z.record(z.string()).optional(),
  }),
  expected: z.object({
    transcript: z.unknown().optional(),
    semantic_embedding: z.string().optional(),
  }),
  tolerance: z.object({
    level: z.enum(["byte", "semantic", "structural"]),
    threshold: z.number().optional(),
  }),
});

export type Bundle = z.infer<typeof BundleSchema>;
export type ActualRecord = z.infer<typeof ActualRecordSchema>;
export type StepRecord = z.infer<typeof StepRecordSchema>;

export type ToleranceLevel = Bundle["tolerance"]["level"];
export type Signature = NonNullable<Bundle["signature"]>;
