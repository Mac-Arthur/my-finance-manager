import { Pipe, PipeTransform } from '@angular/core';

const full = new Intl.NumberFormat('en-GH', { style: 'currency', currency: 'GHS' });
const whole = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  maximumFractionDigits: 0,
});
const compact = new Intl.NumberFormat('en-GH', {
  style: 'currency',
  currency: 'GHS',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export type MoneyFormat = 'full' | 'whole' | 'compact';

export function formatMoney(value: number, format: MoneyFormat = 'full', signed = false): string {
  const f = format === 'compact' ? compact : format === 'whole' ? whole : full;
  const text = f.format(Math.abs(value));
  if (!signed) return value < 0 ? `-${text}` : text;
  return value < 0 ? `−${text}` : `+${text}`;
}

/** `{{ 1234.5 | money }}` → GH₵1,234.50 · `| money:'compact'` → GH₵1.2K · `| money:'full':true` → +GH₵1,234.50 */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(value: number | null | undefined, format: MoneyFormat = 'full', signed = false): string {
    return formatMoney(value ?? 0, format, signed);
  }
}
