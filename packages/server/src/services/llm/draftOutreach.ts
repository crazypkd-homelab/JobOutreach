import { OUTREACH_DRAFT_FORMAT, OutreachDraft, type JobView } from "@joboutreach/shared";
import { loadPrompt } from "./prompts.js";
import { OllamaClient, OllamaError, type ChatMessage } from "./ollamaClient.js";

/** Keep resumes inside context limits while leaving room for JD + system prompt. */
const MAX_INPUT_CHARS = 12_000;
const MAX_ATTEMPTS = 3;

export interface DraftOutreachInput {
  client: Pick<OllamaClient, "chat">;
  model: string;
  job: JobView;
  resumeText: string;
  recipient?: string | null;
}

function buildUserMessage(job: JobView, resumeText: string, recipient?: string | null): string {
  const trimmed = resumeText.length > MAX_INPUT_CHARS ? `${resumeText.slice(0, MAX_INPUT_CHARS)}\n[...truncated]` : resumeText;
  return `To: ${recipient || "the hiring contact"}\n\nJob URL: ${job.sourceUrl ?? "not provided"}\n\nJob description:\n${JSON.stringify(job.jd, null, 2)}\n\nCandidate resume:\n\n${trimmed}`;
}

/**
 * Drafts a referral-request email from a job description and a resume.
 * Uses the same structured-output + retry pattern as extract/score.
 */
export async function draftOutreach({
  client,
  model,
  job,
  resumeText,
  recipient,
}: DraftOutreachInput): Promise<OutreachDraft> {
  if (resumeText.trim().length < 50) {
    throw new OllamaError("invalid_response", "Resume text is too short to draft an email from");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: loadPrompt("outreach_email") },
    { role: "user", content: buildUserMessage(job, resumeText, recipient) },
  ];

  let raw = "";
  let lastIssue = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    raw = await client.chat({ model, messages, format: OUTREACH_DRAFT_FORMAT, temperature: 0.5 });

    let candidate: unknown;
    try {
      candidate = JSON.parse(raw);
    } catch {
      lastIssue = "Response was not valid JSON.";
      messages.push(
        { role: "assistant", content: raw },
        { role: "user", content: `${lastIssue} Return only a JSON object with {subject, body}.` },
      );
      continue;
    }

    const parsed = OutreachDraft.safeParse(candidate);
    if (parsed.success) return parsed.data;

    lastIssue = parsed.error.issues
      .slice(0, 10)
      .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("; ");
    messages.push(
      { role: "assistant", content: raw },
      { role: "user", content: `The JSON failed validation. Fix exactly these problems and return the full object again: ${lastIssue}` },
    );
  }

  throw new OllamaError(
    "invalid_response",
    `Model could not produce a valid email draft after ${MAX_ATTEMPTS} attempts. Last errors: ${lastIssue}`,
  );
}
