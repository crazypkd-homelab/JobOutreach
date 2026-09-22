import { z } from "zod";

export const WorkMode = z.enum(["remote", "hybrid", "onsite", "unknown"]);
export const EmploymentType = z.enum(["full_time", "part_time", "contract", "internship", "unknown"]);
export const Seniority = z.enum(["intern", "junior", "mid", "senior", "staff", "lead", "manager", "unknown"]);

export const Salary = z.object({
  min: z.number().nullable(),
  max: z.number().nullable(),
  currency: z.string().nullable(),
  period: z.enum(["year", "hour"]).nullable(),
});

export const JobDescription = z.object({
  title: z.string(),
  company: z.string(),
  location: z.string().nullish(),
  work_mode: WorkMode,
  employment_type: EmploymentType,
  seniority: Seniority,
  years_experience_min: z.number().nullish(),
  salary: Salary.nullish(),
  summary: z.string(),
  responsibilities: z.array(z.string()),
  required_skills: z.array(z.string()),
  preferred_skills: z.array(z.string()),
  education: z.string().nullish(),
  keywords: z.array(z.string()),
  application_url: z.string().nullish(),
  posted_date: z.string().nullish(),
});

export type JobDescription = z.infer<typeof JobDescription>;

export const JobStatus = z.enum([
  "queued",
  "crawling",
  "needs_manual_input",
  "extracting",
  "extracted",
  "failed",
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const JobSourceType = z.enum(["url", "manual"]);
export type JobSourceType = z.infer<typeof JobSourceType>;
