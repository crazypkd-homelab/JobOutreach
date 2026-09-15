import { existsSync, mkdirSync, writeFileSync, unlinkSync, renameSync } from "node:fs";
import { join } from "node:path";
import { eq, desc } from "drizzle-orm";
import type { ResumeView, UpdateResumeInput } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { resumes } from "../db/schema.js";
import { RESUMES_DIR } from "../config.js";
import { parseResume } from "./resumes/parse.js";

type ResumeRow = typeof resumes.$inferSelect;

export class ResumeNotFoundError extends Error {
  constructor(id: number) {
    super(`Resume ${id} not found`);
  }
}

export function toResumeView(row: ResumeRow): ResumeView {
  return {
    id: row.id,
    name: row.name,
    mime: row.mime,
    parsedText: row.parsedText,
    isActive: row.isActive,
    createdAt: row.createdAt,
  };
}

export class ResumeService {
  constructor(private readonly db: Db) {
    if (!existsSync(RESUMES_DIR)) mkdirSync(RESUMES_DIR, { recursive: true });
  }

  list(): ResumeView[] {
    return this.db.select().from(resumes).orderBy(desc(resumes.createdAt)).all().map(toResumeView);
  }

  get(id: number): ResumeView {
    const row = this.db.select().from(resumes).where(eq(resumes.id, id)).get();
    if (!row) throw new ResumeNotFoundError(id);
    return toResumeView(row);
  }

  /** Upload + parse a resume file. The original is stored in data/resumes/. */
  async upload(fileName: string, buffer: Buffer, mime: string): Promise<ResumeView> {
    const { text, mime: parsedMime } = await parseResume(buffer, mime, fileName);

    // Insert first to get an id, then store the file with a unique name.
    const row = this.db
      .insert(resumes)
      .values({
        name: fileName,
        mime: parsedMime,
        parsedText: text,
        isActive: true,
      })
      .returning()
      .get();

    // Save the original file.
    const ext = fileName.split(".").pop() ?? "bin";
    const storedName = `${row.id}.${ext}`;
    const filePath = join(RESUMES_DIR, storedName);
    writeFileSync(filePath, buffer);

    this.db.update(resumes).set({ filePath: storedName }).where(eq(resumes.id, row.id)).run();

    return toResumeView({ ...row, filePath: storedName });
  }

  update(id: number, input: UpdateResumeInput): ResumeView {
    const row = this.db.select().from(resumes).where(eq(resumes.id, id)).get();
    if (!row) throw new ResumeNotFoundError(id);

    const updated = this.db
      .update(resumes)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.parsedText !== undefined ? { parsedText: input.parsedText } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      })
      .where(eq(resumes.id, id))
      .returning()
      .get();

    return toResumeView(updated);
  }

  remove(id: number): void {
    const row = this.db.select().from(resumes).where(eq(resumes.id, id)).get();
    if (!row) throw new ResumeNotFoundError(id);

    // Delete the file from disk.
    if (row.filePath) {
      const path = join(RESUMES_DIR, row.filePath);
      if (existsSync(path)) unlinkSync(path);
    }

    this.db.delete(resumes).where(eq(resumes.id, id)).run();
  }
}
