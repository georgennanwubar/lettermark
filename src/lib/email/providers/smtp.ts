import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailProvider, SendOptions, SendResult, ProviderCredentials } from '../types';

export class SmtpProvider implements EmailProvider {
  readonly kind = 'smtp' as const;
  private transporter: Transporter;

  constructor(creds: Extract<ProviderCredentials, { kind: 'smtp' }>) {
    this.transporter = nodemailer.createTransport({
      host: creds.host,
      port: creds.port,
      secure: creds.secure,
      auth: creds.user ? { user: creds.user, pass: creds.pass } : undefined,
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  }

  async send(opts: SendOptions): Promise<SendResult> {
    try {
      const info = await this.transporter.sendMail({
        from: opts.from.name ? `"${opts.from.name}" <${opts.from.email}>` : opts.from.email,
        to: opts.to.name ? `"${opts.to.name}" <${opts.to.email}>` : opts.to.email,
        replyTo: opts.replyTo?.email,
        subject: opts.subject,
        html: opts.html,
        text: opts.text,
        headers: {
          ...opts.headers,
          ...(opts.listUnsubscribe && { 'List-Unsubscribe': opts.listUnsubscribe }),
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
        attachments: opts.attachments?.map((a) => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
        messageId: opts.messageId,
      });
      return { success: true, providerMessageId: info.messageId };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // 5xx / connection errors are transient
      const retryable =
        /ETIMEDOUT|ECONNRESET|ECONNREFUSED|EAI_AGAIN|45\d|55\d/i.test(message);
      return { success: false, error: message, retryable };
    }
  }

  async verify() {
    try {
      await this.transporter.verify();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
