import { CategoryTotal } from '../../services/finance/finance';
import { DonutSlice } from './donut';

export const SERIES = [1, 2, 3, 4, 5, 6].map((n) => `var(--series-${n})`);

/** Top N categories get a series colour (fixed order); the rest fold into "Other". */
export type Slice = DonutSlice & { share: number; icon?: string };

export function toSlices(categories: CategoryTotal[], top = 5): Slice[] {
  const head: Slice[] = categories.slice(0, top).map((c, i) => ({
    id: c.id,
    label: c.label,
    value: c.total,
    share: c.share,
    icon: c.icon,
    color: SERIES[i],
  }));
  const rest = categories.slice(top);
  if (rest.length) {
    head.push({
      id: 'other',
      label: `Other (${rest.length})`,
      value: rest.reduce((a, c) => a + c.total, 0),
      share: rest.reduce((a, c) => a + c.share, 0),
      icon: undefined,
      color: 'var(--series-other)',
    });
  }
  return head;
}
