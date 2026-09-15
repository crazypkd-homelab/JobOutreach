import { Hono } from "hono";
import { stream } from "hono/streaming";
import type { Db } from "../db/client.js";
import { pipelineBus } from "../services/pipeline/events.js";

/**
 * SSE endpoint: clients connect here and receive live pipeline events.
 * The Agent Console subscribes to this stream.
 */
export function eventsRoutes(_db: Db) {
  const app = new Hono();

  app.get("/", (c) => {
    // Don't compress — SSE needs unbuffered delivery.
    c.header("Content-Type", "text/event-stream");
    c.header("Cache-Control", "no-cache");
    c.header("Connection", "keep-alive");
    c.header("X-Accel-Buffering", "no");

    return stream(c, async (strm) => {
      // Send a hello so the client knows the stream is alive.
      await strm.write(`data: ${JSON.stringify({ type: "hello", ts: new Date().toISOString() })}\n\n`);

      const unsubscribe = pipelineBus.subscribe(async (event) => {
        try {
          await strm.write(`data: ${JSON.stringify(event)}\n\n`);
        } catch {
          // client disconnected
        }
      });

      // Keep the connection alive with a heartbeat every 30s.
      const heartbeat = setInterval(async () => {
        try {
          await strm.write(`: heartbeat\n\n`);
        } catch {
          /* disconnected */
        }
      }, 30_000);

      // Wait for the client to disconnect (Hono closes the stream when the
      // request ends; we just need to keep the handler alive).
      // The stream stays open until the client disconnects or the server shuts down.
      // We use a promise that resolves on abort.
      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener("abort", () => {
          clearInterval(heartbeat);
          unsubscribe();
          resolve();
        });
      });
    });
  });

  return app;
}
