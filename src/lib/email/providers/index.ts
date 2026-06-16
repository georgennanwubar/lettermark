import type { EmailProvider, ProviderCredentials } from '../types';
import { SmtpProvider } from './smtp';
import { ResendProvider } from './resend';
import { MailgunProvider } from './mailgun';
import { SendGridProvider, PostmarkProvider, SesProvider } from './other';

/**
 * Factory. Given a credentials blob (which carries its own `kind`),
 * returns the right provider instance.
 *
 * Provider instances are cheap to construct except for SMTP, which holds a
 * connection pool — callers should cache per (accountId, providerId) if they
 * send many emails in a row. The queue worker already does.
 */
export function makeProvider(creds: ProviderCredentials): EmailProvider {
  switch (creds.kind) {
    case 'smtp':
      return new SmtpProvider(creds);
    case 'resend':
      return new ResendProvider(creds);
    case 'mailgun':
      return new MailgunProvider(creds);
    case 'sendgrid':
      return new SendGridProvider(creds);
    case 'postmark':
      return new PostmarkProvider(creds);
    case 'ses':
      return new SesProvider(creds);
  }
}

/**
 * Fallback provider from env vars — used before any provider is configured
 * in the UI (e.g. for the welcome / confirmation email at first signup).
 */
export function makeEnvProvider(): EmailProvider {
  const kind = (process.env.MAIL_PROVIDER ?? 'smtp') as ProviderCredentials['kind'];
  switch (kind) {
    case 'smtp':
      return new SmtpProvider({
        kind: 'smtp',
        host: process.env.SMTP_HOST ?? 'localhost',
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === 'true',
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      });
    case 'resend':
      return new ResendProvider({ kind: 'resend', apiKey: process.env.RESEND_API_KEY ?? '' });
    case 'mailgun':
      return new MailgunProvider({
        kind: 'mailgun',
        apiKey: process.env.MAILGUN_API_KEY ?? '',
        domain: process.env.MAILGUN_DOMAIN ?? '',
        region: (process.env.MAILGUN_REGION as 'us' | 'eu') ?? 'us',
      });
    case 'sendgrid':
      return new SendGridProvider({
        kind: 'sendgrid',
        apiKey: process.env.SENDGRID_API_KEY ?? '',
      });
    case 'postmark':
      return new PostmarkProvider({
        kind: 'postmark',
        apiKey: process.env.POSTMARK_API_KEY ?? '',
      });
    case 'ses':
      return new SesProvider({
        kind: 'ses',
        region: process.env.AWS_REGION ?? 'us-east-1',
        accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      });
    default:
      throw new Error(`Unknown MAIL_PROVIDER: ${kind}`);
  }
}
