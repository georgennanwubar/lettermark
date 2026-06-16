import { randomBytes, createHash } from 'crypto';

/**
 * A 32-character lowercase-hex identifier used in URLs.
 * It is NOT derived from the email — that would let URL holders recover the
 * email via dictionary attack. It's a random 16-byte token, stored alongside
 * the email in the subscribers table.
 */
export function generateSubscriberHash(): string {
  return randomBytes(16).toString('hex');
}

/** Quick sha256 hex — used for cache keys, not auth. */
export function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
