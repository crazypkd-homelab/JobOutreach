import type {
  AccountView,
  CreateAccountInput,
  CreateJobInput,
  CreateManualJobInput,
  DashboardCounts,
  JobView,
  PromptView,
  QueueStatus,
  ResumeJobInput,
  ResumeQueueInput,
  RetryJobInput,
  UpdateAccountInput,
} from "@joboutreach/shared";

export interface DashboardResponse {
  counts: DashboardCounts;
  queue: QueueStatus;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly kind?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...init.headers } : init?.headers,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string; kind?: string } | null;
    throw new ApiRequestError(body?.error ?? `${res.status} ${res.statusText}`, res.status, body?.kind);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export const api = {
  dashboard: () => request<DashboardResponse>("/dashboard"),

  accounts: {
    list: () => request<AccountView[]>("/accounts"),
    create: (input: CreateAccountInput) => request<AccountView>("/accounts", { method: "POST", body: JSON.stringify(input) }),
    update: (id: number, input: UpdateAccountInput) =>
      request<AccountView>(`/accounts/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: number) => request<void>(`/accounts/${id}`, { method: "DELETE" }),
    models: (id: number) => request<Array<{ name: string }>>(`/accounts/${id}/models`),
    test: (id: number, model?: string) =>
      request<{ ok: true; model: string }>(`/accounts/${id}/test`, {
        method: "POST",
        body: JSON.stringify({ model }),
      }),
  },

  prompts: {
    list: () => request<PromptView[]>("/prompts"),
    reset: (name: string) => request<PromptView>(`/prompts/${name}/reset`, { method: "POST" }),
  },

  jobs: {
    list: () => request<JobView[]>("/jobs"),
    create: (input: CreateJobInput) => request<JobView>("/jobs", { method: "POST", body: JSON.stringify(input) }),
    createManual: (input: CreateManualJobInput) =>
      request<JobView>("/jobs/manual", { method: "POST", body: JSON.stringify(input) }),
    get: (id: number) => request<JobView>(`/jobs/${id}`),
    resumeWithText: (id: number, input: ResumeJobInput) =>
      request<JobView>(`/jobs/${id}/text`, { method: "POST", body: JSON.stringify(input) }),
    retry: (id: number, input: RetryJobInput) =>
      request<JobView>(`/jobs/${id}/retry`, { method: "POST", body: JSON.stringify(input) }),
  },

  queue: {
    status: () => request<QueueStatus>("/queue"),
    resume: (input: ResumeQueueInput) => request<QueueStatus>("/queue/resume", { method: "POST", body: JSON.stringify(input) }),
  },
};
