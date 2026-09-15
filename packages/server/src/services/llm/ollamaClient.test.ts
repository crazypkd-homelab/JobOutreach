import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaClient, OllamaError } from "./ollamaClient.js";

const client = new OllamaClient("test-key");

function mockFetch(impl: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const spy = vi.fn(impl as unknown as typeof fetch);
  vi.stubGlobal("fetch", spy);
  return spy;
}

const chatBody = (content: string) => new Response(JSON.stringify({ message: { content } }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("OllamaClient", () => {
  it("sends the bearer key and returns assistant content", async () => {
    const spy = mockFetch(() => chatBody("hello"));
    const out = await client.chat({ model: "gpt-oss:20b", messages: [{ role: "user", content: "hi" }] });

    expect(out).toBe("hello");
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("https://ollama.com/api/chat");
    expect((init!.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    const body = JSON.parse(init!.body as string);
    expect(body.stream).toBe(false);
    expect(body.options.temperature).toBe(0);
  });

  it("passes the JSON schema through as `format`", async () => {
    const spy = mockFetch(() => chatBody("{}"));
    await client.chat({
      model: "m",
      messages: [{ role: "user", content: "x" }],
      format: { type: "object" },
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).format).toEqual({ type: "object" });
  });

  it("maps 401 to an auth error", async () => {
    mockFetch(() => new Response(JSON.stringify({ error: "invalid api key" }), { status: 401 }));
    const err = await client.chat({ model: "m", messages: [] }).catch((e: OllamaError) => e);
    expect(err).toBeInstanceOf(OllamaError);
    expect((err as OllamaError).kind).toBe("auth");
    expect((err as OllamaError).isQuota).toBe(false);
  });

  it("maps 429 to a quota error and honours retry-after", async () => {
    mockFetch(() => new Response("rate limited", { status: 429, headers: { "retry-after": "120" } }));
    const err = (await client.chat({ model: "m", messages: [] }).catch((e) => e)) as OllamaError;
    expect(err.kind).toBe("quota");
    expect(err.isQuota).toBe(true);
    expect(err.retryAfter!.getTime()).toBeGreaterThan(Date.now() + 100_000);
  });

  it("treats a quota message on a 400 as a quota error", async () => {
    mockFetch(() => new Response(JSON.stringify({ error: "daily quota exceeded" }), { status: 400 }));
    const err = (await client.chat({ model: "m", messages: [] }).catch((e) => e)) as OllamaError;
    expect(err.kind).toBe("quota");
  });

  it("maps 404 to a model error", async () => {
    mockFetch(() => new Response("model not found", { status: 404 }));
    const err = (await client.chat({ model: "nope", messages: [] }).catch((e) => e)) as OllamaError;
    expect(err.kind).toBe("model");
  });

  it("maps transport failures to a network error", async () => {
    mockFetch(() => {
      throw new Error("ECONNREFUSED");
    });
    const err = (await client.chat({ model: "m", messages: [] }).catch((e) => e)) as OllamaError;
    expect(err.kind).toBe("network");
  });

  it("rejects an empty assistant message", async () => {
    mockFetch(() => chatBody("   "));
    const err = (await client.chat({ model: "m", messages: [] }).catch((e) => e)) as OllamaError;
    expect(err.kind).toBe("invalid_response");
  });

  it("lists models", async () => {
    mockFetch(() => new Response(JSON.stringify({ models: [{ name: "gpt-oss:20b" }] }), { status: 200 }));
    expect(await client.listModels()).toEqual([{ name: "gpt-oss:20b" }]);
  });

  it("ping caps the response length", async () => {
    const spy = mockFetch(() => chatBody("ok"));
    await client.ping("gpt-oss:20b");
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).options.num_predict).toBe(4);
  });
});
