import { describe, expect, it } from "vitest";
import { computeMatchScore, MatchScoreLLM, DEFAULT_SCORE_WEIGHTS } from "./score.js";

const sample: MatchScoreLLM = {
  breakdown: {
    required_skills: { score: 80, matched: ["typescript"], missing: ["go"] },
    preferred_skills: { score: 50, matched: [], missing: ["kubernetes"] },
    experience: { score: 100, note: "6y vs 5y required" },
    domain_fit: { score: 60, note: "adjacent domain" },
    education: { score: 100, note: "BS CS" },
  },
  strengths: ["strong TS"],
  gaps: ["no Go"],
  resume_tweaks: ["mention k8s exposure"],
};

describe("computeMatchScore", () => {
  it("recomputes overall from weighted sub-scores", () => {
    const r = computeMatchScore(sample, DEFAULT_SCORE_WEIGHTS);
    // 80*.45 + 50*.15 + 100*.2 + 60*.1 + 100*.1 = 36+7.5+20+6+10 = 79.5 -> 80
    expect(r.overall).toBe(80);
    expect(r.verdict).toBe("strong");
  });

  it("accepts LLM output shape", () => {
    expect(MatchScoreLLM.safeParse(sample).success).toBe(true);
  });
});
