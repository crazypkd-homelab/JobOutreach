import { eq } from "drizzle-orm";
import type { SmtpSettingsInput, SmtpSettingsView } from "@joboutreach/shared";
import type { Db } from "../../db/client.js";
import { settings } from "../../db/schema.js";
import { decrypt, encrypt } from "../crypto.js";

const SMTP_KEY = "smtp";

interface StoredSmtp {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export class SmtpSettingsService {
  constructor(private readonly db: Db) {}

  /** Returns the public view, or null if SMTP has never been configured. */
  get(): SmtpSettingsView | null {
    const row = this.db.select().from(settings).where(eq(settings.key, SMTP_KEY)).get();
    if (!row) return null;
    try {
      const stored = JSON.parse(decrypt(row.valueEnc)) as StoredSmtp;
      return {
        host: stored.host,
        port: stored.port,
        secure: stored.secure,
        user: stored.user,
        hasPassword: stored.password.length > 0,
        fromName: stored.fromName,
        fromEmail: stored.fromEmail,
        updatedAt: row.updatedAt,
      };
    } catch {
      return null;
    }
  }

  /** Returns the full decrypted settings for mailer use. Throws if not configured. */
  getDecrypted(): StoredSmtp {
    const row = this.db.select().from(settings).where(eq(settings.key, SMTP_KEY)).get();
    if (!row) throw new Error("SMTP is not configured");
    return JSON.parse(decrypt(row.valueEnc)) as StoredSmtp;
  }

  /** Upserts the SMTP settings. */
  save(input: SmtpSettingsInput): SmtpSettingsView {
    const stored: StoredSmtp = {
      host: input.host,
      port: input.port,
      secure: input.secure,
      user: input.user,
      password: input.password,
      fromName: input.fromName,
      fromEmail: input.fromEmail,
    };
    const enc = encrypt(JSON.stringify(stored));
    const existing = this.db.select().from(settings).where(eq(settings.key, SMTP_KEY)).get();
    if (existing) {
      this.db.update(settings).set({ valueEnc: enc, updatedAt: new Date().toISOString() }).where(eq(settings.key, SMTP_KEY)).run();
    } else {
      this.db.insert(settings).values({ key: SMTP_KEY, valueEnc: enc }).run();
    }
    return this.get()!;
  }
}
