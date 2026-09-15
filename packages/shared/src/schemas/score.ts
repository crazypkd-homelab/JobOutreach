import { z } from "zod";

const pct = z.number().min(0).max(100);

const SkillDimension = z.object({
  score: pct,
  matched: z.array(z.string()),
  missing: z.array(z.string()),
});

const NoteDimension = z.object({
  score: pct,
  note: z.string(),
});

export const ScoreWeights = z.object({
  required_skills: z.number().min(0).max(1),
  preferred_skills: z.number().min(0).max(1),
  experience: z.number().min(0).max(1),
  domain_fit: z.number().min(0).max(1),
  education: z.number().min(0).max(1),
});
export type ScoreWeights = z.infer<typeof ScoreWeights>;

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  required_skills: 0.45,
  preferred_skills: 0.15,
  experience: 0.2,
  domain_fit: 0.1,
  education: 0.1,
};

export const Verdict = z.enum(["strong", "good", "weak", "poor"]);
export type Verdict = z.infer<typeof Verdict>;

/** Shape the LLM must return. `overall` is intentionally absent; we compute it. */
export const MatchScoreLLM = z.object({
  breakdown: z.object({
    required_skills: SkillDimension,
    preferred_skills: SkillDimension,
    experience: NoteDimension,
    domain_fit: NoteDimension,
    education: NoteDimension,
  }),
  strengths: z.array(z.string()),
  gaps: z.array(z.string()),
  resume_tweaks: z.array(z.string()),
});
export type MatchScoreLLM = z.infer<typeof MatchScoreLLM>;

export const MatchScore = MatchScoreLLM.extend({
  overall: pct,
  weights: ScoreWeights,
  verdict: Verdict,
});
export type MatchScore = z.infer<typeof MatchScore>;

export function verdictFor(overall: number): Verdict {
  if (overall >= 80) return "strong";
  if (overall >= 65) return "good";
  if (overall >= 45) return "weak";
  return "poor";
}

/** Deterministic server-side aggregation so the number never depends on LLM arithmetic. */
export function computeMatchScore(llm: MatchScoreLLM, weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS): MatchScore {
  const b = llm.breakdown;
  const totalWeight =
    weights.required_skills + weights.preferred_skills + weights.experience + weights.domain_fit + weights.education;
  const raw =
    b.required_skills.score * weights.required_skills +
    b.preferred_skills.score * weights.preferred_skills +
    b.experience.score * weights.experience +
    b.domain_fit.score * weights.domain_fit +
    b.education.score * weights.education;
  const overall = Math.round(totalWeight > 0 ? raw / totalWeight : 0);
  return { ...llm, overall, weights, verdict: verdictFor(overall) };
}
