import type { DashboardCounts } from "@joboutreach/shared";

export interface DashboardResponse {
  counts: DashboardCounts;
  queue: { state: "idle" | "running" | "paused" };
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`/api${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () => get<DashboardResponse>("/dashboard"),
};
