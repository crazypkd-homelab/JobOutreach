import type {
  AccountView,
  CreateAccountInput,
  CreateJobInput,
  CreateManualJobInput,
  CreateMatchInput,
  DashboardCounts,
  DraftOutreachInput,
  JobView,
  MatchScoreView,
  OutreachDraft,
  PromptView,
  QueueStatus,
  ResumeJobInput,
  ResumeQueueInput,
  ResumeView,
  RetryJobInput,
  SendOutreachInput,
  SmtpSettingsInput,
  SmtpSettingsView,
  UpdateAccountInput,
  UpdateResumeInput,
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
  const isFormData = init?.body instanceof FormData;
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body
      ? isFormData
        ? init.headers // let the browser set multipart boundary
        : { "Content-Type": "application/json", ...init.headers }
      : init?.headers,
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

  resumes: {
    list: () => request<ResumeView[]>("/resumes"),
    upload: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<ResumeView>("/resumes", { method: "POST", body: form });
    },
    update: (id: number, input: UpdateResumeInput) =>
      request<ResumeView>(`/resumes/${id}`, { method: "PATCH", body: JSON.stringify(input) }),
    remove: (id: number) => request<void>(`/resumes/${id}`, { method: "DELETE" }),
  },

  jobs: {
    list: () => request<JobView[]>("/jobs"),
    create: (input: CreateJobInput) => request<JobView>("/jobs", { method: "POST", body: JSON.stringify(input) }),
    createManual: (input: CreateManualJobInput) =>
      request<JobView>("/jobs/manual", { method: "POST", body: JSON.stringify(input) }),
    get: (id: number) => request<JobView>(`/jobs/${id}`),
    remove: (id: number) => request<void>(`/jobs/${id}`, { method: "DELETE" }),
    resumeWithText: (id: number, input: ResumeJobInput) =>
      request<JobView>(`/jobs/${id}/text`, { method: "POST", body: JSON.stringify(input) }),
    retry: (id: number, input: RetryJobInput) =>
      request<JobView>(`/jobs/${id}/retry`, { method: "POST", body: JSON.stringify(input) }),
    matches: (jobId: number) => request<MatchScoreView[]>(`/jobs/${jobId}/matches`),
    scoreMatch: (jobId: number, input: CreateMatchInput) =>
      request<MatchScoreView>(`/jobs/${jobId}/matches`, { method: "POST", body: JSON.stringify(input) }),
    deleteMatch: (jobId: number, matchId: number) =>
      request<void>(`/jobs/${jobId}/matches/${matchId}`, { method: "DELETE" }),
    draftOutreach: (jobId: number, input: DraftOutreachInput) =>
      request<OutreachDraft>(`/jobs/${jobId}/outreach/draft`, { method: "POST", body: JSON.stringify(input) }),
    sendOutreach: (jobId: number, input: SendOutreachInput) =>
      request<{ ok: true; sentAt: string }>(`/jobs/${jobId}/outreach/send`, { method: "POST", body: JSON.stringify(input) }),
  },

  queue: {
    status: () => request<QueueStatus>("/queue"),
    resume: (input: ResumeQueueInput) => request<QueueStatus>("/queue/resume", { method: "POST", body: JSON.stringify(input) }),
  },

  smtp: {
    get: () => request<SmtpSettingsView>("/settings/smtp"),
    save: (input: SmtpSettingsInput) =>
      request<SmtpSettingsView>("/settings/smtp", { method: "PUT", body: JSON.stringify(input) }),
    test: () => request<{ ok: true }>("/settings/smtp/test", { method: "POST" }),
  },
};
