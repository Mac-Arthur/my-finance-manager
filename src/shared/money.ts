import { Injectable, Pipe, PipeTransform, inject, signal } from '@angular/core';
import { CurrencyCode } from '../models/finance';

export type MoneyFormat = 'full' | 'whole' | 'compact';
const LOCALES: Record<CurrencyCode, string> = { GHS: 'en-GH', USD: 'en-US', GBP: 'en-GB', EUR: 'en-IE', CAD: 'en-CA', AUD: 'en-AU', NGN: 'en-NG', KES: 'en-KE', ZAR: 'en-ZA' };
const formatters = new Map<string, Intl.NumberFormat>();

@Injectable({ providedIn: 'root' })
export class CurrencyDisplay {
  readonly current = signal<CurrencyCode>('GHS');
}

function formatter(currency: CurrencyCode, format: MoneyFormat) {
  const key = `${currency}:${format}`;
  const existing = formatters.get(key);
  if (existing) return existing;
  const created = new Intl.NumberFormat(LOCALES[currency], {
    style: 'currency', currency,
    ...(format === 'compact' ? { notation: 'compact', maximumFractionDigits: 1 } : format === 'whole' ? { maximumFractionDigits: 0 } : {}),
  });
  formatters.set(key, created);
  return created;
}

export function formatMoney(value: number, format: MoneyFormat = 'full', signed = false, currency: CurrencyCode = 'GHS'): string {
  const text = formatter(currency, format).format(Math.abs(value));
  if (!signed) return value < 0 ? `-${text}` : text;
  return value < 0 ? `−${text}` : `+${text}`;
}

/** `{{ 1234.5 | money }}` → GH₵1,234.50 · `| money:'compact'` → GH₵1.2K · `| money:'full':true` → +GH₵1,234.50 */
@Pipe({ name: 'money', pure: false })
export class MoneyPipe implements PipeTransform {
  private readonly display = inject(CurrencyDisplay);
  transform(value: number | null | undefined, format: MoneyFormat = 'full', signed = false, currency?: CurrencyCode): string {
    return formatMoney(value ?? 0, format, signed, currency ?? this.display.current());
  }
}
