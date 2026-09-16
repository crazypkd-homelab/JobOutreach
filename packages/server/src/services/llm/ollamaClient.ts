const OLLAMA_HOST = "https://ollama.com";

export type OllamaErrorKind = "auth" | "quota" | "payment" | "model" | "network" | "server" | "invalid_response";

export class OllamaError extends Error {
  constructor(
    readonly kind: OllamaErrorKind,
    message: string,
    readonly status?: number,
    /** Set for quota errors when the API tells us when access returns. */
    readonly retryAfter?: Date,
  ) {
    super(message);
    this.name = "OllamaError";
  }

  /** Quota/rate-limit errors are the ones that should pause the queue. */
  get isQuota(): boolean {
    return this.kind === "quota";
  }
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  /** JSON Schema for structured output. */
  format?: Record<string, unknown>;
  temperature?: number;
  /** Fixed seed for deterministic output (same input → same output). */
  seed?: number;
  /** Cheap connectivity check; keeps the response to a single token. */
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface OllamaModel {
  name: string;
  size?: number;
  modified_at?: string;
}

interface ChatResponse {
  message?: { content?: string };
}

function parseRetryAfter(header: string | null): Date | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return new Date(Date.now() + seconds * 1000);
  const date = new Date(header);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** Maps transport and HTTP failures onto actionable, user-facing categories. */
async function toOllamaError(res: Response): Promise<OllamaError> {
  const body = await res.text().catch(() => "");
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed.error) detail = parsed.error;
  } catch {
    /* body was not JSON; keep the raw snippet */
  }

  if (res.status === 401 || res.status === 403) {
    return new OllamaError("auth", `Ollama rejected the API key: ${detail || res.statusText}`, res.status);
  }
  if (res.status === 429 || /quota|rate limit|limit reached|too many/i.test(detail)) {
    return new OllamaError(
      "quota",
      `Ollama usage limit reached: ${detail || "rate limited"}`,
      res.status,
      parseRetryAfter(res.headers.get("retry-after")),
    );
  }
  if (res.status === 402) {
    return new OllamaError(
      "payment",
      `This model requires a subscription or usage credits. Select a free model instead. (Upgrade at https://ollama.com/upgrade)`,
      res.status,
    );
  }
  if (res.status === 404) {
    return new OllamaError("model", `Model not available on this account: ${detail || res.statusText}`, 404);
  }
  return new OllamaError("server", `Ollama request failed (${res.status}): ${detail || res.statusText}`, res.status);
}

export class OllamaClient {
  constructor(
    private readonly apiKey: string,
    private readonly host: string = OLLAMA_HOST,
  ) {}

  private async request(path: string, init: RequestInit & { signal?: AbortSignal }): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.host}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          ...init.headers,
        },
      });
    } catch (cause) {
      throw new OllamaError("network", `Could not reach ${this.host}: ${(cause as Error).message}`);
    }
    if (!res.ok) throw await toOllamaError(res);
    return res;
  }

  /** Models this key can actually run, for the UI dropdowns. */
  async listModels(signal?: AbortSignal): Promise<OllamaModel[]> {
    const res = await this.request("/api/tags", { method: "GET", signal });
    const body = (await res.json()) as { models?: OllamaModel[] };
    return body.models ?? [];
  }

  /** Non-streaming chat. Returns the raw assistant content. */
  async chat(opts: ChatOptions): Promise<string> {
    const res = await this.request("/api/chat", {
      method: "POST",
      signal: opts.signal,
      body: JSON.stringify({
        model: opts.model,
        messages: opts.messages,
        stream: false,
        ...(opts.format ? { format: opts.format } : {}),
        options: {
          temperature: opts.temperature ?? 0,
          ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
          ...(opts.maxTokens ? { num_predict: opts.maxTokens } : {}),
        },
      }),
    });

    const body = (await res.json()) as ChatResponse;
    const content = body.message?.content;
    if (typeof content !== "string" || content.trim() === "") {
      throw new OllamaError("invalid_response", "Ollama returned an empty message");
    }
    return content;
  }

  /** Smallest possible round-trip, used by the "Test" button. */
  async ping(model: string, signal?: AbortSignal): Promise<void> {
    await this.chat({
      model,
      messages: [{ role: "user", content: "Reply with the single word: ok" }],
      maxTokens: 4,
      signal,
    });
  }
}
