import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { UpdateResumeInput } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { ResumeService, ResumeNotFoundError } from "../services/resumes.js";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export function resumeRoutes(db: Db) {
  const app = new Hono();
  const resumes = new ResumeService(db);

  app.get("/", (c) => c.json(resumes.list()));

  app.post(
    "/",
    bodyLimit({ maxSize: MAX_FILE_SIZE }),
    async (c) => {
      const formData = await c.req.formData();
      const file = formData.get("file");
      if (!(file instanceof File)) {
        return c.json({ error: "No file uploaded. Send a 'file' field in multipart/form-data." }, 400);
      }

      if (file.size === 0) return c.json({ error: "File is empty" }, 400);
      if (file.size > MAX_FILE_SIZE) return c.json({ error: "File too large (max 10 MB)" }, 413);

      const buffer = Buffer.from(await file.arrayBuffer());
      const resume = await resumes.upload(file.name, buffer, file.type || "application/octet-stream");
      return c.json(resume, 201);
    },
  );

  app.get("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid resume id" }, 400);
    return c.json(resumes.get(id));
  });

  app.patch("/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid resume id" }, 400);

    const parsed = UpdateResumeInput.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 400);

    return c.json(resumes.update(id, parsed.data));
  });

  app.delete("/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid resume id" }, 400);
    resumes.remove(id);
    return c.body(null, 204);
  });

  app.onError((err, c) => {
    if (err instanceof ResumeNotFoundError) return c.json({ error: err.message }, 404);
    console.error("[resumes]", err);
    return c.json({ error: "Internal error" }, 500);
  });

  return app;
}
