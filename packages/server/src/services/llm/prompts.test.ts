import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync, utimesSync, writeFileSync } from "node:fs";
import { bootstrap } from "../../config.js";
import { loadPrompt, promptInfo, resetPrompt } from "./prompts.js";

beforeAll(() => bootstrap());

describe("prompt loader", () => {
  it("loads the bundled prompt from the data volume", () => {
    expect(loadPrompt("extract_jd")).toMatch(/extraction engine/i);
    expect(loadPrompt("score_resume")).toMatch(/recruiter/i);
  });

  it("picks up edits without a restart, then restores the default", () => {
    const { path } = promptInfo("extract_jd");
    const original = readFileSync(path, "utf8");
    try {
      writeFileSync(path, "EDITED PROMPT");
      // Bump mtime explicitly: same-second writes can otherwise look unchanged.
      const future = new Date(Date.now() + 2000);
      utimesSync(path, future, future);

      expect(loadPrompt("extract_jd")).toBe("EDITED PROMPT");
      expect(promptInfo("extract_jd").isDefault).toBe(false);

      resetPrompt("extract_jd");
      expect(loadPrompt("extract_jd")).toBe(original);
      expect(promptInfo("extract_jd").isDefault).toBe(true);
    } finally {
      writeFileSync(path, original);
      resetPrompt("extract_jd");
    }
  });

  it("recreates a deleted prompt from the bundled default", () => {
    const { path } = promptInfo("score_resume");
    const original = readFileSync(path, "utf8");
    writeFileSync(path, "");
    resetPrompt("score_resume");
    expect(loadPrompt("score_resume")).toBe(original);
  });
});
