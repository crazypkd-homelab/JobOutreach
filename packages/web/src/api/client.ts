import type {
  AccountView,
  CreateAccountInput,
  DashboardCounts,
  PromptView,
  UpdateAccountInput,
} from "@joboutreach/shared";

export interface DashboardResponse {
  counts: DashboardCounts;
  queue: { state: "idle" | "running" | "paused" };
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
};
