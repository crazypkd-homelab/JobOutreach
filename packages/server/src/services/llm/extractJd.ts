import { JOB_DESCRIPTION_FORMAT, JobDescription } from "@joboutreach/shared";
import { loadPrompt } from "./prompts.js";
import { OllamaClient, OllamaError, type ChatMessage } from "./ollamaClient.js";

/** Postings can be enormous; keep well inside context limits without losing the body. */
const MAX_INPUT_CHARS = 24_000;
const MAX_ATTEMPTS = 3;

/** Only `chat` is needed, which keeps this testable without a real client. */
export type ChatCapable = Pick<OllamaClient, "chat">;

export interface ExtractJdInput {
  client: ChatCapable;
  model: string;
  text: string;
  sourceUrl?: string | null;
  signal?: AbortSignal;
  onLog?: (message: string) => void;
}

export interface ExtractJdResult {
  jd: JobDescription;
  attempts: number;
  raw: string;
}

function buildUserMessage(text: string, sourceUrl?: string | null): string {
  const trimmed = text.length > MAX_INPUT_CHARS ? `${text.slice(0, MAX_INPUT_CHARS)}\n[...truncated]` : text;
  const header = sourceUrl ? `Source URL: ${sourceUrl}\n\n` : "";
  return `${header}Job posting text:\n\n${trimmed}`;
}

/**
 * Extracts a structured job description. Ollama is given the JSON Schema so the
 * shape is enforced upstream; we still validate and, if a field is wrong, feed
 * the validation errors back for a repair attempt.
 */
export async function extractJd({
  client,
  model,
  text,
  sourceUrl,
  signal,
  onLog,
}: ExtractJdInput): Promise<ExtractJdResult> {
  if (text.trim().length < 100) {
    throw new OllamaError("invalid_response", "Posting text is too short to extract a job description from");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: loadPrompt("extract_jd") },
    { role: "user", content: buildUserMessage(text, sourceUrl) },
  ];

  let raw = "";
  let lastIssue = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    raw = await client.chat({ model, messages, format: JOB_DESCRIPTION_FORMAT, temperature: 0, signal });

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

    const parsed = JobDescription.safeParse(candidate);
    if (parsed.success) return { jd: parsed.data, attempts: attempt, raw };

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
    `Model could not produce a valid job description after ${MAX_ATTEMPTS} attempts. Last errors: ${lastIssue}`,
  );
}
