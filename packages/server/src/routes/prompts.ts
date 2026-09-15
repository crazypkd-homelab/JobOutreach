import { Hono } from "hono";
import { isPromptName, PROMPT_NAMES, promptInfo, resetPrompt } from "../services/llm/prompts.js";

export function promptRoutes() {
  const app = new Hono();

  app.get("/", (c) => c.json(PROMPT_NAMES.map((name) => promptInfo(name))));

  app.get("/:name", (c) => {
    const name = c.req.param("name");
    if (!isPromptName(name)) return c.json({ error: `Unknown prompt "${name}"` }, 404);
    return c.json(promptInfo(name));
  });

  app.post("/:name/reset", (c) => {
    const name = c.req.param("name");
    if (!isPromptName(name)) return c.json({ error: `Unknown prompt "${name}"` }, 404);
    resetPrompt(name);
    return c.json(promptInfo(name));
  });

  return app;
}
