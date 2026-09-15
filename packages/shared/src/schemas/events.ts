import { z } from "zod";

export const EventKind = z.enum(["crawl", "extract", "score", "email"]);
export type EventKind = z.infer<typeof EventKind>;

export const EventOutcome = z.enum(["success", "failed", "manual_fallback"]);
export type EventOutcome = z.infer<typeof EventOutcome>;

export const DashboardCounts = z.object({
  crawl: z.object({ success: z.number(), failed: z.number(), manual_fallback: z.number() }),
  extract: z.object({ success: z.number(), failed: z.number() }),
  score: z.object({ success: z.number(), failed: z.number() }),
  email: z.object({ success: z.number(), failed: z.number() }),
});
export type DashboardCounts = z.infer<typeof DashboardCounts>;
