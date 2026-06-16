/**
 * Provider-agnostic email sending interface.
 *
 * Mirrors what Mailster does with its `MailsterMail` class + delivery addons:
 * every provider implements the same `send()` so the queue worker doesn't care
 * which service is behind it.
 *
 * Adding a new provider:
 *   1. Implement `EmailProvider` in src/lib/email/providers/<name>.ts
 *   2. Register it in src/lib/email/providers/index.ts (the `providers` map)
 *   3. Add config UI in /settings/delivery
 */

export interface EmailAddress {
  email: string;
  name?: string;
}

export interface EmailAttachment {
  filename: string;
  content: Buffer | string;
  contentType?: string;
}

export interface SendOptions {
  from: EmailAddress;
  to: EmailAddress;
  replyTo?: EmailAddress;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
  attachments?: EmailAttachment[];
  /** RFC-compliant List-Unsubscribe header (URL or mailto:) */
  listUnsubscribe?: string;
  /** Application-level message id you want to track; provider may also return its own */
  messageId?: string;
  /** Tags / categories for provider-side filtering */
  tags?: string[];
}

export interface SendResult {
  success: boolean;
  /** Provider-assigned message id, when available */
  providerMessageId?: string;
  error?: string;
  /** True for retryable failures (5xx, network) so the worker can requeue */
  retryable?: boolean;
}

export interface EmailProvider {
  /** Stable identifier — must match `provider_kind` enum value */
  readonly kind: 'smtp' | 'resend' | 'mailgun' | 'sendgrid' | 'postmark' | 'ses';
  send(opts: SendOptions): Promise<SendResult>;
  /**
   * Optional: lightweight credentials check used by the settings UI.
   * Default behaviour falls back to attempting a no-op send.
   */
  verify?(): Promise<{ ok: boolean; error?: string }>;
}

/** Provider config as stored in the `email_providers.credentials` JSON column */
export type ProviderCredentials =
  | { kind: 'smtp'; host: string; port: number; secure: boolean; user?: string; pass?: string }
  | { kind: 'resend'; apiKey: string }
  | { kind: 'mailgun'; apiKey: string; domain: string; region?: 'us' | 'eu' }
  | { kind: 'sendgrid'; apiKey: string }
  | { kind: 'postmark'; apiKey: string }
  | { kind: 'ses'; region: string; accessKeyId: string; secretAccessKey: string };
