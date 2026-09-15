import { MATCH_SCORE_FORMAT, MatchScoreLLM, computeMatchScore, type MatchScore, type ScoreWeights } from "@joboutreach/shared";
import { loadPrompt } from "./prompts.js";
import { OllamaError, type ChatMessage } from "./ollamaClient.js";
import type { ChatCapable } from "./extractJd.js";

/** Fixed seed so the same resume + JD always produces the same score. */
const DETERMINISTIC_SEED = 42;
const MAX_RESUME_CHARS = 16_000;
const MAX_ATTEMPTS = 3;

export interface ScoreResumeInput {
  client: ChatCapable;
  model: string;
  /** Structured JD JSON (already extracted). */
  jdJson: unknown;
  /** Plain text of the resume. */
  resumeText: string;
  weights?: ScoreWeights;
  signal?: AbortSignal;
  onLog?: (message: string) => void;
}

export interface ScoreResumeResult {
  score: MatchScore;
  attempts: number;
  raw: string;
}

function buildUserMessage(jdJson: unknown, resumeText: string): string {
  const trimmed = resumeText.length > MAX_RESUME_CHARS ? `${resumeText.slice(0, MAX_RESUME_CHARS)}\n[...truncated]` : resumeText;
  return [
    "Job description (JSON):",
    JSON.stringify(jdJson, null, 2),
    "",
    "Resume text:",
    trimmed,
  ].join("\n");
}

/**
 * Scores a resume against a JD. Uses temperature=0 and a fixed seed for
 * deterministic output — the same resume + JD always produces the same score.
 * The overall score is computed server-side from the LLM's dimension scores,
 * so it never depends on LLM arithmetic.
 */
export async function scoreResume({
  client,
  model,
  jdJson,
  resumeText,
  weights,
  signal,
  onLog,
}: ScoreResumeInput): Promise<ScoreResumeResult> {
  if (resumeText.trim().length < 50) {
    throw new OllamaError("invalid_response", "Resume text is too short to score");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: loadPrompt("score_resume") },
    { role: "user", content: buildUserMessage(jdJson, resumeText) },
  ];

  let raw = "";
  let lastIssue = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    raw = await client.chat({
      model,
      messages,
      format: MATCH_SCORE_FORMAT,
      temperature: 0,
      seed: DETERMINISTIC_SEED,
      signal,
    });

    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      lastIssue = "Response was not valid JSON.";
      onLog?.(`attempt ${attempt}: ${lastIssue}`);
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: `${lastIssue} Return only a JSON object matching the schema.` },
      );
      continue;
    }

    const parsed = MatchScoreLLM.safeParse(candidate);
    if (parsed.success) {
      const score = computeMatchScore(parsed.data, weights);
      return { score, attempts: attempt, raw };
    }

    lastIssue = parsed.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    onLog?.(`attempt ${attempt}: schema validation failed — ${lastIssue}`);
    messages.push(
      { role: "assistant", content: raw },
      { role: "user", content: `The JSON failed validation. Fix exactly these problems and return the full object again: ${lastIssue}` },
    );
  }

  throw new OllamaError(
    "invalid_response",
    `Model could not produce a valid match score after ${MAX_ATTEMPTS} attempts. Last errors: ${lastIssue}`,
  );
}
