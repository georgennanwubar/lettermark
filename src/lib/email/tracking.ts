/**
 * Tracking utilities.
 *
 * Open tracking: insert a 1x1 transparent gif pointing at /api/track/open
 * Click tracking: rewrite every <a href> into /api/track/click?l=…&s=…
 *
 * Subscriber identification uses the 32-char `hash` (not the email or id) so
 * tracking URLs are opaque and don't leak PII into referrer headers.
 */

import { createHmac } from 'crypto';

function secret() {
  return process.env.TRACKING_SECRET ?? 'dev-tracking-secret';
}

/** HMAC-sign a payload so we can detect tampering with tracking URLs. */
export function signTracking(payload: string): string {
  return createHmac('sha256', secret()).update(payload).digest('hex').slice(0, 16);
}

export function verifyTracking(payload: string, sig: string): boolean {
  return signTracking(payload) === sig;
}

const appUrl = () => (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

/** URL for the 1x1 open-tracking pixel. */
export function openPixelUrl(campaignId: number, subscriberHash: string): string {
  const payload = `${campaignId}:${subscriberHash}`;
  return `${appUrl()}/api/track/open?c=${campaignId}&s=${subscriberHash}&t=${signTracking(payload)}`;
}

/** Rewrite an outbound link through our redirector. */
export function trackedLinkUrl(
  campaignId: number,
  subscriberHash: string,
  linkId: number
): string {
  const payload = `${campaignId}:${subscriberHash}:${linkId}`;
  return `${appUrl()}/api/track/click?c=${campaignId}&s=${subscriberHash}&l=${linkId}&t=${signTracking(payload)}`;
}

/** One-click unsubscribe URL (for the `unsubscribe` merge tag and headers). */
export function unsubscribeUrl(campaignId: number | null, subscriberHash: string): string {
  const payload = `${campaignId ?? 0}:${subscriberHash}`;
  return `${appUrl()}/unsubscribe?c=${campaignId ?? ''}&s=${subscriberHash}&t=${signTracking(payload)}`;
}

export function profileUrl(subscriberHash: string): string {
  return `${appUrl()}/profile?s=${subscriberHash}&t=${signTracking(subscriberHash)}`;
}

export function webVersionUrl(campaignId: number, subscriberHash: string): string {
  return `${appUrl()}/archive/${campaignId}?s=${subscriberHash}`;
}

/**
 * Process HTML for a single recipient:
 *  - rewrite every <a href="…"> to go through /api/track/click (and emit
 *    the link rows the caller should upsert)
 *  - append the open pixel just before </body>
 *
 * Returns { html, links } so the caller can persist links to the `links` table.
 */
export interface TrackedHtml {
  html: string;
  /** Deduped, in insertion order — caller should INSERT … ON CONFLICT */
  links: Array<{ url: string; index: number }>;
}

const HREF_RE = /<a\s+([^>]*?)href=(["'])([^"']+)\2([^>]*)>/gi;

export function instrumentHtml(
  html: string,
  campaignId: number,
  subscriberHash: string,
  /** A function mapping URL → linkId. Resolve all URLs in your route handler
   *  before calling this (one DB round-trip per campaign, not per email). */
  linkIdFor: (url: string) => number,
  options: { trackOpens?: boolean; trackClicks?: boolean } = {}
): TrackedHtml {
  const { trackOpens = true, trackClicks = true } = options;
  const links: TrackedHtml['links'] = [];

  let out = html;

  if (trackClicks) {
    out = out.replace(HREF_RE, (full, pre, _quote, url, post) => {
      // Skip anchors, mailto:, tel:, and our own tracking URLs
      if (/^(#|mailto:|tel:|javascript:)/i.test(url)) return full;
      if (url.includes('/api/track/')) return full;
      // Skip merge-tag URLs ({unsubscribe}, {profile}, …) — they're already system links
      if (/^\{[a-z]+\}$/i.test(url)) return full;

      const linkId = linkIdFor(url);
      const tracked = trackedLinkUrl(campaignId, subscriberHash, linkId);
      links.push({ url, index: linkId });
      return `<a ${pre}href="${tracked}"${post}>`;
    });
  }

  if (trackOpens) {
    const pixel = `<img src="${openPixelUrl(campaignId, subscriberHash)}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0;" />`;
    out = out.includes('</body>') ? out.replace('</body>', `${pixel}</body>`) : out + pixel;
  }

  return { html: out, links };
}
