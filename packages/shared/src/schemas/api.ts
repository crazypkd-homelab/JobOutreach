import { z } from "zod";
import { JobDescription, JobSourceType, JobStatus } from "./job.js";
import { MatchScore } from "./score.js";

export const CreateAccountInput = z.object({
  label: z.string().min(1).max(60),
  apiKey: z.string().min(1),
  extractModel: z.string().min(1).optional(),
  scoreModel: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

export const UpdateAccountInput = z.object({
  label: z.string().min(1).max(60).optional(),
  apiKey: z.string().min(1).optional(),
  extractModel: z.string().min(1).optional(),
  scoreModel: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateAccountInput = z.infer<typeof UpdateAccountInput>;

/** Account as returned by the API — never includes the key itself. */
export const AccountView = z.object({
  id: z.number(),
  label: z.string(),
  keyHint: z.string(),
  isDefault: z.boolean(),
  extractModel: z.string(),
  scoreModel: z.string(),
  lastUsedAt: z.string().nullable(),
  lastError: z.string().nullable(),
  quotaExhaustedUntil: z.string().nullable(),
  quotaExhausted: z.boolean(),
});
export type AccountView = z.infer<typeof AccountView>;

export const PromptView = z.object({
  name: z.string(),
  path: z.string(),
  text: z.string(),
  updatedAt: z.string(),
  isDefault: z.boolean(),
});
export type PromptView = z.infer<typeof PromptView>;

export const ApiError = z.object({ error: z.string(), kind: z.string().optional() });
export type ApiError = z.infer<typeof ApiError>;

// ─── Jobs ──────────────────────────────────────────────────────────────────

export const CreateJobInput = z.object({
  sourceUrl: z.string().url().max(2000),
  accountId: z.number().int().positive(),
  model: z.string().min(1).optional(),
});
export type CreateJobInput = z.infer<typeof CreateJobInput>;

export const CreateManualJobInput = z.object({
  text: z.string().min(100).max(50_000),
  sourceUrl: z.string().url().max(2000).optional().or(z.literal("")),
  accountId: z.number().int().positive(),
  model: z.string().min(1).optional(),
});
export type CreateManualJobInput = z.infer<typeof CreateManualJobInput>;

export const ResumeJobInput = z.object({
  text: z.string().min(100).max(50_000),
  accountId: z.number().int().positive(),
  model: z.string().min(1).optional(),
});
export type ResumeJobInput = z.infer<typeof ResumeJobInput>;

export const RetryJobInput = z.object({
  accountId: z.number().int().positive(),
  model: z.string().min(1).optional(),
});
export type RetryJobInput = z.infer<typeof RetryJobInput>;

export const JobView = z.object({
  id: z.number(),
  sourceUrl: z.string().nullable(),
  sourceType: JobSourceType,
  status: JobStatus,
  failureReason: z.string().nullable(),
  ollamaAccountId: z.number().nullable(),
  modelUsed: z.string().nullable(),
  title: z.string().nullable(),
  company: z.string().nullable(),
  location: z.string().nullable(),
  jd: JobDescription.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type JobView = z.infer<typeof JobView>;

export const QueueState = z.enum(["idle", "running", "paused"]);
export type QueueState = z.infer<typeof QueueState>;

export const QueueStatus = z.object({
  state: QueueState,
  runningJobId: z.number().nullable(),
  queuedCount: z.number(),
  pausedReason: z.string().nullable(),
});
export type QueueStatus = z.infer<typeof QueueStatus>;

export const ResumeQueueInput = z.object({
  accountId: z.number().int().positive(),
});
export type ResumeQueueInput = z.infer<typeof ResumeQueueInput>;

// ─── SSE events ────────────────────────────────────────────────────────────

export const PipelineEvent = z.object({
  type: z.enum(["log", "job", "queue"]),
  jobId: z.number().nullable().optional(),
  level: z.string().optional(),
  message: z.string().optional(),
  status: z.string().optional(),
  queueState: z.string().optional(),
  ts: z.string(),
});
export type PipelineEvent = z.infer<typeof PipelineEvent>;

// ─── Resumes ───────────────────────────────────────────────────────────────

export const ResumeView = z.object({
  id: z.number(),
  name: z.string(),
  mime: z.string().nullable(),
  parsedText: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type ResumeView = z.infer<typeof ResumeView>;

export const UpdateResumeInput = z.object({
  name: z.string().min(1).max(120).optional(),
  parsedText: z.string().max(100_000).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateResumeInput = z.infer<typeof UpdateResumeInput>;

// ─── Match scores ───────────────────────────────────────────────────────────

export const MatchScoreView = z.object({
  id: z.number(),
  jobId: z.number(),
  resumeId: z.number(),
  resumeName: z.string(),
  ollamaAccountId: z.number().nullable(),
  modelUsed: z.string().nullable(),
  score: MatchScore,
  overallScore: z.number(),
  createdAt: z.string(),
});
export type MatchScoreView = z.infer<typeof MatchScoreView>;

export const CreateMatchInput = z.object({
  resumeId: z.number().int().positive(),
  accountId: z.number().int().positive(),
  model: z.string().optional(),
});
export type CreateMatchInput = z.infer<typeof CreateMatchInput>;
