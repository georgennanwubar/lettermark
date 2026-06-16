import type { EmailProvider, SendOptions, SendResult, ProviderCredentials } from '../types';

// ─── SendGrid ──────────────────────────────────────────────────────────────
export class SendGridProvider implements EmailProvider {
  readonly kind = 'sendgrid' as const;
  constructor(private creds: Extract<ProviderCredentials, { kind: 'sendgrid' }>) {}

  async send(opts: SendOptions): Promise<SendResult> {
    try {
      const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.creds.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          personalizations: [
            {
              to: [{ email: opts.to.email, name: opts.to.name }],
              headers: {
                ...(opts.listUnsubscribe && { 'List-Unsubscribe': opts.listUnsubscribe }),
                ...opts.headers,
              },
            },
          ],
          from: { email: opts.from.email, name: opts.from.name },
          reply_to: opts.replyTo ? { email: opts.replyTo.email } : undefined,
          subject: opts.subject,
          content: [
            { type: 'text/plain', value: opts.text },
            { type: 'text/html', value: opts.html },
          ],
          categories: opts.tags,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: text, retryable: res.status >= 500 };
      }
      // SendGrid returns the id in the X-Message-Id header
      return { success: true, providerMessageId: res.headers.get('x-message-id') ?? undefined };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  }
}

// ─── Postmark ──────────────────────────────────────────────────────────────
export class PostmarkProvider implements EmailProvider {
  readonly kind = 'postmark' as const;
  constructor(private creds: Extract<ProviderCredentials, { kind: 'postmark' }>) {}

  async send(opts: SendOptions): Promise<SendResult> {
    try {
      const res = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': this.creds.apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          From: opts.from.name ? `"${opts.from.name}" <${opts.from.email}>` : opts.from.email,
          To: opts.to.email,
          ReplyTo: opts.replyTo?.email,
          Subject: opts.subject,
          HtmlBody: opts.html,
          TextBody: opts.text,
          MessageStream: 'broadcast', // important: use broadcast stream for newsletters
          Headers: [
            ...(opts.listUnsubscribe
              ? [{ Name: 'List-Unsubscribe', Value: opts.listUnsubscribe }]
              : []),
            ...Object.entries(opts.headers ?? {}).map(([Name, Value]) => ({ Name, Value })),
          ],
          Tag: opts.tags?.[0],
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: text, retryable: res.status >= 500 };
      }
      const json = (await res.json()) as { MessageID?: string };
      return { success: true, providerMessageId: json.MessageID };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  }
}

// ─── Amazon SES ────────────────────────────────────────────────────────────
/**
 * SES via raw SigV4-signed HTTPS so we don't pull in the entire @aws-sdk
 * (saves ~3 MB of cold start). Uses the SES v2 SendEmail action.
 *
 * If you'd rather use the official SDK, swap in @aws-sdk/client-sesv2 here.
 */
import { createHmac, createHash } from 'crypto';

function sign(key: Buffer | string, msg: string) {
  return createHmac('sha256', key).update(msg).digest();
}

export class SesProvider implements EmailProvider {
  readonly kind = 'ses' as const;
  constructor(private creds: Extract<ProviderCredentials, { kind: 'ses' }>) {}

  async send(opts: SendOptions): Promise<SendResult> {
    const region = this.creds.region;
    const host = `email.${region}.amazonaws.com`;
    const body = JSON.stringify({
      FromEmailAddress: opts.from.name
        ? `"${opts.from.name}" <${opts.from.email}>`
        : opts.from.email,
      Destination: { ToAddresses: [opts.to.email] },
      ReplyToAddresses: opts.replyTo ? [opts.replyTo.email] : undefined,
      Content: {
        Simple: {
          Subject: { Data: opts.subject, Charset: 'UTF-8' },
          Body: {
            Html: { Data: opts.html, Charset: 'UTF-8' },
            Text: { Data: opts.text, Charset: 'UTF-8' },
          },
        },
      },
    });

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = amzDate.slice(0, 8);
    const canonicalUri = '/v2/email/outbound-emails';
    const payloadHash = createHash('sha256').update(body).digest('hex');
    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-date';
    const canonicalRequest = `POST\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
    const algorithm = 'AWS4-HMAC-SHA256';
    const credentialScope = `${dateStamp}/${region}/ses/aws4_request`;
    const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;

    const kDate = sign('AWS4' + this.creds.secretAccessKey, dateStamp);
    const kRegion = sign(kDate, region);
    const kService = sign(kRegion, 'ses');
    const kSigning = sign(kService, 'aws4_request');
    const signature = createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    const authorization = `${algorithm} Credential=${this.creds.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    try {
      const res = await fetch(`https://${host}${canonicalUri}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Amz-Date': amzDate,
          Authorization: authorization,
        },
        body,
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: text, retryable: res.status >= 500 };
      }
      const json = (await res.json()) as { MessageId?: string };
      return { success: true, providerMessageId: json.MessageId };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  }
}
