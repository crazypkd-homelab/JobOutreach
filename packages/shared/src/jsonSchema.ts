import type { ZodTypeAny } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { OutreachDraft } from "./schemas/api.js";
import { JobDescription } from "./schemas/job.js";
import { MatchScoreLLM } from "./schemas/score.js";

/**
 * Ollama's structured-output `format` parameter takes a plain JSON Schema.
 * Inlining `$ref`s keeps it a single self-contained object, which the models
 * follow far more reliably than a schema with definitions.
 */
export function toOllamaFormat(schema: ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, { $refStrategy: "none", target: "jsonSchema7" }) as Record<string, unknown>;
}

export const JOB_DESCRIPTION_FORMAT = toOllamaFormat(JobDescription);
export const MATCH_SCORE_FORMAT = toOllamaFormat(MatchScoreLLM);
export const OUTREACH_DRAFT_FORMAT = toOllamaFormat(OutreachDraft);
