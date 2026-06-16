import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat().format(n);
}

export function formatPercent(n: number, decimals = 1): string {
  return new Intl.NumberFormat(undefined, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

export function formatDate(d: Date | string | number, format: 'short' | 'long' = 'short'): string {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: format === 'long' ? 'long' : 'medium',
    timeStyle: format === 'long' ? 'short' : undefined,
  }).format(date);
}

export function timeAgo(d: Date | string | number): string {
  const date = typeof d === 'string' || typeof d === 'number' ? new Date(d) : d;
  const seconds = (Date.now() - date.getTime()) / 1000;
  const ranges: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [60, 'second'],
    [3600, 'minute'],
    [86400, 'hour'],
    [604800, 'day'],
    [2592000, 'week'],
    [31536000, 'month'],
    [Infinity, 'year'],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  let prev = 1;
  for (const [limit, unit] of ranges) {
    if (seconds < limit) {
      return rtf.format(-Math.round(seconds / prev), unit);
    }
    prev = limit;
  }
  return formatDate(date);
}
