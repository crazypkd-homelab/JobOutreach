/**
 * Heuristics for deciding whether a fetched page actually contains a job
 * posting or is a wall (login, captcha, JS-only, rate-limit block).
 *
 * Returns a verdict plus a reason so the pipeline can log it and decide
 * whether to fall back to the browser or ask the user to paste.
 */
export interface HeuristicResult {
  ok: boolean;
  reason: string;
}

const MIN_TEXT_LENGTH = 400;

const BLOCK_SIGNALS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /sign\s*in to (see|view|continue)/i, reason: "login wall" },
  { pattern: /log\s*in (to|with).*(account|continue|see)/i, reason: "login wall" },
  { pattern: /please (enable|turn on) (javascript|js)/i, reason: "javascript required" },
  { pattern: /enable\s*javascript/i, reason: "javascript required" },
  { pattern: /requires javascript/i, reason: "javascript required" },
  { pattern: /verify you are human/i, reason: "captcha" },
  { pattern: /are you a robot/i, reason: "captcha" },
  { pattern: /unusual activity/i, reason: "captcha" },
  { pattern: /access denied/i, reason: "access denied" },
  { pattern: /request\s*blocked/i, reason: "blocked" },
  { pattern: /rate.?limit/i, reason: "rate limited" },
  { pattern: /too many requests/i, reason: "rate limited" },
  { pattern: /ddos protection/i, reason: "ddos protection" },
  { pattern: /checking your browser/i, reason: "bot check" },
];

/** Job-ish signals that suggest the page really is a posting. */
const JOB_SIGNALS = [
  /\b(responsibilities|requirements|qualifications|what you'?ll do)\b/i,
  /\b(required skills|preferred skills|nice to have|bonus)\b/i,
  /\b(years? of experience|minimum experience)\b/i,
  /\b(apply now|apply for this job|submit your application)\b/i,
  /\b(full[- ]time|part[- ]time|contract|remote|hybrid|on[- ]site)\b/i,
  /\b(benefits|salary|compensation|equity|pto|paid time off)\b/i,
];

export function evaluateContent(text: string): HeuristicResult {
  const trimmed = text.trim();

  // Check block signals first — a short login wall is still a login wall,
  // and we don't want to fall through to the browser for it.
  const head = trimmed.slice(0, 2000);
  for (const { pattern, reason } of BLOCK_SIGNALS) {
    if (pattern.test(head)) return { ok: false, reason };
  }

  if (trimmed.length < MIN_TEXT_LENGTH) {
    return { ok: false, reason: `content too short (${trimmed.length} chars < ${MIN_TEXT_LENGTH})` };
  }

  // Need at least one job-ish signal somewhere in the text.
  const hasJobSignal = JOB_SIGNALS.some((p) => p.test(trimmed));
  if (!hasJobSignal) {
    return { ok: false, reason: "no job-posting signals found" };
  }

  return { ok: true, reason: "content looks like a job posting" };
}

/** Quick check on HTTP status — some codes mean "don't bother with Readability". */
export function isBlockStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429 || status === 451;
}
