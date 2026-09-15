import { eq, ne } from "drizzle-orm";
import type { AccountView, CreateAccountInput, UpdateAccountInput } from "@joboutreach/shared";
import type { Db } from "../db/client.js";
import { ollamaAccounts } from "../db/schema.js";
import { decrypt, encrypt } from "./crypto.js";
import { OllamaClient } from "./llm/ollamaClient.js";

type AccountRow = typeof ollamaAccounts.$inferSelect;

export class AccountNotFoundError extends Error {
  constructor(id: number) {
    super(`Account ${id} not found`);
  }
}

/** Never expose the key; the UI only needs enough to recognise it. */
function keyHint(apiKeyEnc: string): string {
  try {
    const key = decrypt(apiKeyEnc);
    return `…${key.slice(-4)}`;
  } catch {
    return "…????";
  }
}

export function toView(row: AccountRow): AccountView {
  const until = row.quotaExhaustedUntil;
  return {
    id: row.id,
    label: row.label,
    keyHint: keyHint(row.apiKeyEnc),
    isDefault: row.isDefault,
    extractModel: row.extractModel,
    scoreModel: row.scoreModel,
    lastUsedAt: row.lastUsedAt,
    lastError: row.lastError,
    quotaExhaustedUntil: until,
    quotaExhausted: until !== null && new Date(until) > new Date(),
  };
}

export class AccountService {
  constructor(private readonly db: Db) {}

  list(): AccountView[] {
    return this.db.select().from(ollamaAccounts).orderBy(ollamaAccounts.id).all().map(toView);
  }

  private row(id: number): AccountRow {
    const row = this.db.select().from(ollamaAccounts).where(eq(ollamaAccounts.id, id)).get();
    if (!row) throw new AccountNotFoundError(id);
    return row;
  }

  get(id: number): AccountView {
    return toView(this.row(id));
  }

  /** Decrypted client for pipeline use. Callers must not log the key. */
  clientFor(id: number): { client: OllamaClient; account: AccountRow } {
    const account = this.row(id);
    return { client: new OllamaClient(decrypt(account.apiKeyEnc)), account };
  }

  private clearOtherDefaults(id: number): void {
    this.db.update(ollamaAccounts).set({ isDefault: false }).where(ne(ollamaAccounts.id, id)).run();
  }

  create(input: CreateAccountInput): AccountView {
    // The first account added becomes the default so the UI always has a selection.
    const isFirst = this.db.select().from(ollamaAccounts).limit(1).all().length === 0;
    const row = this.db
      .insert(ollamaAccounts)
      .values({
        label: input.label,
        apiKeyEnc: encrypt(input.apiKey),
        isDefault: input.isDefault ?? isFirst,
        ...(input.extractModel ? { extractModel: input.extractModel } : {}),
        ...(input.scoreModel ? { scoreModel: input.scoreModel } : {}),
      })
      .returning()
      .get();

    if (row.isDefault) this.clearOtherDefaults(row.id);
    return toView(row);
  }

  update(id: number, input: UpdateAccountInput): AccountView {
    this.row(id);
    const row = this.db
      .update(ollamaAccounts)
      .set({
        ...(input.label !== undefined ? { label: input.label } : {}),
        ...(input.apiKey !== undefined ? { apiKeyEnc: encrypt(input.apiKey) } : {}),
        ...(input.extractModel !== undefined ? { extractModel: input.extractModel } : {}),
        ...(input.scoreModel !== undefined ? { scoreModel: input.scoreModel } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
      })
      .where(eq(ollamaAccounts.id, id))
      .returning()
      .get();

    if (row.isDefault) this.clearOtherDefaults(id);
    return toView(row);
  }

  remove(id: number): void {
    const row = this.row(id);
    this.db.delete(ollamaAccounts).where(eq(ollamaAccounts.id, id)).run();
    if (!row.isDefault) return;
    // Keep exactly one default alive.
    const next = this.db.select().from(ollamaAccounts).orderBy(ollamaAccounts.id).limit(1).get();
    if (next) this.db.update(ollamaAccounts).set({ isDefault: true }).where(eq(ollamaAccounts.id, next.id)).run();
  }

  markUsed(id: number): void {
    this.db
      .update(ollamaAccounts)
      .set({ lastUsedAt: new Date().toISOString(), lastError: null })
      .where(eq(ollamaAccounts.id, id))
      .run();
  }

  markError(id: number, message: string): void {
    this.db.update(ollamaAccounts).set({ lastError: message }).where(eq(ollamaAccounts.id, id)).run();
  }

  /** Records that a key is out of quota so the UI can suggest another account. */
  markQuotaExhausted(id: number, until: Date, message: string): void {
    this.db
      .update(ollamaAccounts)
      .set({ quotaExhaustedUntil: until.toISOString(), lastError: message })
      .where(eq(ollamaAccounts.id, id))
      .run();
  }

  clearQuota(id: number): void {
    this.db.update(ollamaAccounts).set({ quotaExhaustedUntil: null }).where(eq(ollamaAccounts.id, id)).run();
  }
}
