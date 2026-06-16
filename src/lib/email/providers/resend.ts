import type { EmailProvider, SendOptions, SendResult, ProviderCredentials } from '../types';

export class ResendProvider implements EmailProvider {
  readonly kind = 'resend' as const;
  constructor(private creds: Extract<ProviderCredentials, { kind: 'resend' }>) {}

  async send(opts: SendOptions): Promise<SendResult> {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.creds.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: opts.from.name ? `${opts.from.name} <${opts.from.email}>` : opts.from.email,
          to: [opts.to.email],
          reply_to: opts.replyTo?.email,
          subject: opts.subject,
          html: opts.html,
          text: opts.text,
          headers: {
            ...opts.headers,
            ...(opts.listUnsubscribe && { 'List-Unsubscribe': opts.listUnsubscribe }),
          },
          tags: opts.tags?.map((name) => ({ name, value: 'true' })),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: text, retryable: res.status >= 500 };
      }
      const json = (await res.json()) as { id?: string };
      return { success: true, providerMessageId: json.id };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  }
}
