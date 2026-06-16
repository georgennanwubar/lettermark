import type { EmailProvider, SendOptions, SendResult, ProviderCredentials } from '../types';

export class MailgunProvider implements EmailProvider {
  readonly kind = 'mailgun' as const;
  constructor(private creds: Extract<ProviderCredentials, { kind: 'mailgun' }>) {}

  private get host() {
    return this.creds.region === 'eu' ? 'api.eu.mailgun.net' : 'api.mailgun.net';
  }

  async send(opts: SendOptions): Promise<SendResult> {
    const form = new FormData();
    form.append(
      'from',
      opts.from.name ? `${opts.from.name} <${opts.from.email}>` : opts.from.email
    );
    form.append('to', opts.to.email);
    if (opts.replyTo) form.append('h:Reply-To', opts.replyTo.email);
    form.append('subject', opts.subject);
    form.append('html', opts.html);
    form.append('text', opts.text);
    if (opts.listUnsubscribe) form.append('h:List-Unsubscribe', opts.listUnsubscribe);
    for (const [k, v] of Object.entries(opts.headers ?? {})) form.append(`h:${k}`, v);
    for (const tag of opts.tags ?? []) form.append('o:tag', tag);

    try {
      const res = await fetch(`https://${this.host}/v3/${this.creds.domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`api:${this.creds.apiKey}`).toString('base64'),
        },
        body: form,
      });
      if (!res.ok) {
        const text = await res.text();
        return { success: false, error: text, retryable: res.status >= 500 };
      }
      const json = (await res.json()) as { id?: string };
      return { success: true, providerMessageId: json.id?.replace(/[<>]/g, '') };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
        retryable: true,
      };
    }
  }
}
