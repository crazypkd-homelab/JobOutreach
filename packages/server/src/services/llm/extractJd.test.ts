import { beforeAll, describe, expect, it, vi } from "vitest";
import type { JobDescription } from "@joboutreach/shared";
import { bootstrap } from "../../config.js";
import { extractJd, type ChatCapable } from "./extractJd.js";
import { OllamaError } from "./ollamaClient.js";

const POSTING = `Senior Platform Engineer at Acme Corp. Remote (US).
We need 5+ years of experience with TypeScript, Kubernetes and PostgreSQL.
You will own our deployment pipeline and mentor engineers. BS in CS preferred.
Salary 180000 - 210000 USD per year. Nice to have: Terraform, Go.`.repeat(2);

const VALID: JobDescription = {
  title: "Senior Platform Engineer",
  company: "Acme Corp",
  location: "US",
  work_mode: "remote",
  employment_type: "full_time",
  seniority: "senior",
  years_experience_min: 5,
  salary: { min: 180000, max: 210000, currency: "USD", period: "year" },
  summary: "Own the deployment pipeline.",
  responsibilities: ["own deployment pipeline"],
  required_skills: ["typescript", "kubernetes", "postgresql"],
  preferred_skills: ["terraform", "go"],
  education: "BS in CS",
  keywords: ["platform", "kubernetes"],
  application_url: null,
  posted_date: null,
};

/** Returns the queued responses in order, recording the messages it was sent. */
function stubClient(responses: string[]) {
  const calls: Array<{ messages: unknown[]; format?: unknown }> = [];
  const client: ChatCapable = {
    chat: vi.fn(async ({ messages, format }) => {
      calls.push({ messages: structuredClone(messages), format });
      const next = responses.shift();
      if (next === undefined) throw new Error("stub ran out of responses");
      return next;
    }),
  };
  return { client, calls };
}

beforeAll(() => bootstrap());

describe("extractJd", () => {
  it("returns a validated job description on the first attempt", async () => {
    const { client, calls } = stubClient([JSON.stringify(VALID)]);
    const result = await extractJd({ client, model: "gpt-oss:20b", text: POSTING, sourceUrl: "https://x/y" });

    expect(result.attempts).toBe(1);
    expect(result.jd.required_skills).toContain("kubernetes");
    // System prompt comes from the prompt file, and the schema is enforced upstream.
    expect((calls[0]!.messages as Array<{ role: string }>)[0]!.role).toBe("system");
    expect(calls[0]!.format).toMatchObject({ type: "object" });
  });

  it("recovers when the model returns non-JSON, feeding the problem back", async () => {
    const { client, calls } = stubClient(["here you go: not json", JSON.stringify(VALID)]);
    const result = await extractJd({ client, model: "m", text: POSTING });

    expect(result.attempts).toBe(2);
    const followUp = calls[1]!.messages as Array<{ role: string; content: string }>;
    expect(followUp.at(-1)!.content).toMatch(/not valid JSON/i);
  });

  it("asks the model to fix specific schema violations", async () => {
    const broken = { ...VALID, work_mode: "anywhere", required_skills: "typescript" };
    const { client, calls } = stubClient([JSON.stringify(broken), JSON.stringify(VALID)]);
    const logs: string[] = [];
    const result = await extractJd({ client, model: "m", text: POSTING, onLog: (m) => logs.push(m) });

    expect(result.attempts).toBe(2);
    const repair = (calls[1]!.messages as Array<{ content: string }>).at(-1)!.content;
    expect(repair).toContain("work_mode");
    expect(repair).toContain("required_skills");
    expect(logs[0]).toMatch(/schema validation failed/);
  });

  it("gives up after three attempts", async () => {
    const bad = JSON.stringify({ title: "only this" });
    const { client } = stubClient([bad, bad, bad]);
    const err = (await extractJd({ client, model: "m", text: POSTING }).catch((e) => e)) as OllamaError;

    expect(err).toBeInstanceOf(OllamaError);
    expect(err.kind).toBe("invalid_response");
    expect(client.chat).toHaveBeenCalledTimes(3);
  });

  it("rejects text too short to be a posting", async () => {
    const { client } = stubClient([]);
    await expect(extractJd({ client, model: "m", text: "hiring!" })).rejects.toThrow(/too short/i);
    expect(client.chat).not.toHaveBeenCalled();
  });

  it("truncates very long postings", async () => {
    const { client, calls } = stubClient([JSON.stringify(VALID)]);
    await extractJd({ client, model: "m", text: "x".repeat(40_000) });
    const user = (calls[0]!.messages as Array<{ content: string }>).at(-1)!.content;
    expect(user).toContain("[...truncated]");
    expect(user.length).toBeLessThan(25_000 + 200);
  });
});
