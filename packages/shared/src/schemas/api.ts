import { z } from "zod";

export const CreateAccountInput = z.object({
  label: z.string().min(1).max(60),
  apiKey: z.string().min(10),
  extractModel: z.string().min(1).optional(),
  scoreModel: z.string().min(1).optional(),
  isDefault: z.boolean().optional(),
});
export type CreateAccountInput = z.infer<typeof CreateAccountInput>;

export const UpdateAccountInput = z.object({
  label: z.string().min(1).max(60).optional(),
  apiKey: z.string().min(10).optional(),
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
