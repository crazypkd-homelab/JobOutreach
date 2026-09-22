import type { createApp } from "../src/app.js";

type App = ReturnType<typeof createApp>;

export async function getAuthCookie(app: App): Promise<string> {
  const res = await app.request("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "testuser", password: "testpass123" }),
  });
  if (res.status !== 201) {
    throw new Error(`Registration failed: ${res.status} ${await res.text()}`);
  }
  const cookie = res.headers.get("set-cookie");
  if (!cookie) throw new Error("No set-cookie header from registration");
  // Hono sends the cookie value plus attributes; the fetch-cookie client needs
  // just the name=value pair for the Cookie header.
  return cookie.split(";")[0]!;
}
