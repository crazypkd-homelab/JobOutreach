import nodemailer, { type Transporter } from "nodemailer";
import type { SmtpSettingsView } from "@joboutreach/shared";

export interface ResolvedSmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
}

export interface SendMailInput {
  to: string;
  subject: string;
  body: string;
  attachments?: Array<{ filename: string; path: string }>;
}

export class SmtpError extends Error {
  constructor(message: string, readonly kind: "auth" | "connection" | "other" = "other") {
    super(message);
  }
}

function fromAddress(s: Pick<ResolvedSmtpSettings, "fromName" | "fromEmail">): string {
  return `${s.fromName} <${s.fromEmail}>`;
}

export class SmtpMailer {
  private transport: Transporter | null = null;
  private lastKey = "";

  constructor(private readonly settings: ResolvedSmtpSettings) {}

  private get client(): Transporter {
    const key = `${this.settings.host}:${this.settings.port}:${this.settings.user}:${this.settings.password}`;
    if (this.transport && key === this.lastKey) return this.transport;
    this.transport = nodemailer.createTransport({
      host: this.settings.host,
      port: this.settings.port,
      secure: this.settings.secure,
      auth: { user: this.settings.user, pass: this.settings.password },
    });
    this.lastKey = key;
    return this.transport;
  }

  /** Verifies the SMTP server accepts the credentials. Throws SmtpError on failure. */
  async verify(): Promise<void> {
    try {
      await this.client.verify();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const kind = /auth/i.test(msg) ? "auth" : /connect|timeout|socket|ECONN/i.test(msg) ? "connection" : "other";
      throw new SmtpError(msg, kind);
    }
  }

  async send(input: SendMailInput): Promise<void> {
    try {
      await this.client.sendMail({
        from: fromAddress(this.settings),
        to: input.to,
        subject: input.subject,
        text: input.body,
        attachments: input.attachments,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const kind = /auth/i.test(msg) ? "auth" : /connect|timeout|socket|ECONN/i.test(msg) ? "connection" : "other";
      throw new SmtpError(msg, kind);
    }
  }
}

/** Convenience: build a mailer from a settings view + decrypted password. */
export function mailerFromSettings(view: SmtpSettingsView, password: string): SmtpMailer {
  return new SmtpMailer({
    host: view.host,
    port: view.port,
    secure: view.secure,
    user: view.user,
    password,
    fromName: view.fromName,
    fromEmail: view.fromEmail,
  });
}
