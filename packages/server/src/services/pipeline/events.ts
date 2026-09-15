import { EventEmitter } from "node:events";
import type { PipelineEvent } from "@joboutreach/shared";

/**
 * Central bus for pipeline events. Pipeline steps emit here; the SSE route
 * subscribes and forwards to connected clients. The DB is the durable record
 * (pipeline_logs + events tables); this is the live stream on top.
 */
class PipelineBus extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(50); // many SSE clients
  }

  /** Emit a structured event to all SSE subscribers. */
  emitEvent(event: Omit<PipelineEvent, "ts"> & { ts?: string }): void {
    const full: PipelineEvent = { ts: event.ts ?? new Date().toISOString(), ...event };
    this.emit("event", full);
  }

  /** Convenience: a log line for the agent console. */
  log(jobId: number | null, level: "info" | "warn" | "error", message: string): void {
    this.emitEvent({ type: "log", jobId, level, message });
  }

  /** Convenience: a job status change. */
  jobStatus(jobId: number, status: string): void {
    this.emitEvent({ type: "job", jobId, status });
  }

  /** Convenience: a queue state change. */
  queueState(state: string): void {
    this.emitEvent({ type: "queue", queueState: state });
  }

  /** Subscribe to all events. Returns an unsubscribe function. */
  subscribe(listener: (event: PipelineEvent) => void): () => void {
    this.on("event", listener);
    return () => this.off("event", listener);
  }
}

export const pipelineBus = new PipelineBus();
