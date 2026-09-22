import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const now = sql`(strftime('%Y-%m-%dT%H:%M:%fZ','now'))`;
const id = () => integer("id").primaryKey({ autoIncrement: true });

export const ollamaAccounts = sqliteTable("ollama_accounts", {
  id: id(),
  label: text("label").notNull(),
  apiKeyEnc: text("api_key_enc").notNull(),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  extractModel: text("extract_model").notNull().default("gpt-oss:20b"),
  scoreModel: text("score_model").notNull().default("gpt-oss:120b"),
  lastUsedAt: text("last_used_at"),
  lastError: text("last_error"),
  quotaExhaustedUntil: text("quota_exhausted_until"),
  createdAt: text("created_at").notNull().default(now),
});

export const jobs = sqliteTable(
  "jobs",
  {
    id: id(),
    sourceUrl: text("source_url"),
    sourceType: text("source_type").notNull(), // 'url' | 'manual'
    title: text("title"),
    company: text("company"),
    location: text("location"),
    rawHtml: text("raw_html"),
    rawText: text("raw_text"),
    status: text("status").notNull().default("queued"),
    failureReason: text("failure_reason"),
    ollamaAccountId: integer("ollama_account_id").references(() => ollamaAccounts.id, { onDelete: "set null" }),
    modelUsed: text("model_used"),
    jdJson: text("jd_json", { mode: "json" }),
    createdAt: text("created_at").notNull().default(now),
    updatedAt: text("updated_at").notNull().default(now),
  },
  (t) => ({ statusIdx: index("jobs_status_idx").on(t.status) }),
);

export const resumes = sqliteTable("resumes", {
  id: id(),
  name: text("name").notNull(),
  filePath: text("file_path"),
  mime: text("mime"),
  parsedText: text("parsed_text").notNull().default(""),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(now),
});

export const matchScores = sqliteTable(
  "match_scores",
  {
    id: id(),
    jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
    resumeId: integer("resume_id").notNull().references(() => resumes.id, { onDelete: "cascade" }),
    ollamaAccountId: integer("ollama_account_id").references(() => ollamaAccounts.id, { onDelete: "set null" }),
    modelUsed: text("model_used"),
    scoreJson: text("score_json", { mode: "json" }).notNull(),
    overallScore: real("overall_score").notNull(),
    createdAt: text("created_at").notNull().default(now),
  },
  (t) => ({ uniq: uniqueIndex("match_scores_job_resume_uniq").on(t.jobId, t.resumeId) }),
);

export const contacts = sqliteTable("contacts", {
  id: id(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role"),
  linkedinUrl: text("linkedin_url"),
  notes: text("notes"),
  createdAt: text("created_at").notNull().default(now),
});

export const emailTemplates = sqliteTable("email_templates", {
  id: id(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const outreachEmails = sqliteTable("outreach_emails", {
  id: id(),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  contactId: integer("contact_id").references(() => contacts.id, { onDelete: "set null" }),
  templateId: integer("template_id").references(() => emailTemplates.id, { onDelete: "set null" }),
  resumeId: integer("resume_id").references(() => resumes.id, { onDelete: "set null" }),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  status: text("status").notNull().default("draft"), // 'draft' | 'sent' | 'failed'
  sentAt: text("sent_at"),
  error: text("error"),
  createdAt: text("created_at").notNull().default(now),
});

export const users = sqliteTable("users", {
  id: id(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: text("created_at").notNull().default(now),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  valueEnc: text("value_enc").notNull(),
  updatedAt: text("updated_at").notNull().default(now),
});

export const pipelineLogs = sqliteTable(
  "pipeline_logs",
  {
    id: id(),
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    ts: text("ts").notNull().default(now),
    level: text("level").notNull().default("info"),
    message: text("message").notNull(),
  },
  (t) => ({ jobIdx: index("pipeline_logs_job_idx").on(t.jobId) }),
);

export const events = sqliteTable(
  "events",
  {
    id: id(),
    ts: text("ts").notNull().default(now),
    kind: text("kind").notNull(), // 'crawl' | 'extract' | 'score' | 'email'
    outcome: text("outcome").notNull(), // 'success' | 'failed' | 'manual_fallback'
    jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
    accountId: integer("account_id").references(() => ollamaAccounts.id, { onDelete: "set null" }),
    metaJson: text("meta_json", { mode: "json" }),
  },
  (t) => ({ kindTsIdx: index("events_kind_ts_idx").on(t.kind, t.ts) }),
);
