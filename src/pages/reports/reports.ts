import { EmptyState } from '../../components/empty-state/empty-state';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { AreaChart } from '../../components/charts/area-chart';
import { Donut } from '../../components/charts/donut';
import { SERIES, toSlices } from '../../components/charts/slices';
import { Finance } from '../../services/finance/finance';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { MoneyPipe } from '../../shared/money';
import { ICONS } from '../../shared/icons';

@Component({
  selector: 'app-reports',
  imports: [EmptyState, DatePipe, DecimalPipe, MoneyPipe, CountUp, Icon, AreaChart, Donut],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports {
  protected readonly f = inject(Finance);
  protected readonly icons = ICONS;
  protected readonly series = SERIES;

  protected readonly showAllCategories = signal(false);
  protected readonly activeSlice = signal<string | null>(null);

  protected readonly categories = computed(() => {
    const all = this.f.spendingByCategory();
    return this.showAllCategories() ? all : all.slice(0, 6);
  });
  protected readonly maxCategory = computed(() => this.f.spendingByCategory()[0]?.total ?? 1);

  protected readonly incomeSlices = computed(() =>
    toSlices(
      this.f.incomeByCategory().map((c) => ({
        id: c.id,
        label: c.label,
        icon: '',
        kind: 'in' as const,
        total: c.total,
        count: 0,
        share: c.total / this.f.moneyIn(),
      })),
      3,
    ),
  );

  protected readonly kpis = computed(() => [
    { label: 'Money in', value: this.f.moneyIn(), fmt: 'whole' as const },
    { label: 'Money out', value: this.f.moneyOut(), fmt: 'whole' as const },
    { label: 'Fees', value: this.f.fees(), fmt: 'full' as const },
    { label: 'Transactions', value: this.f.transactions().length, fmt: 'number' as const },
    { label: 'Avg spend / day', value: this.f.avgDailySpend(), fmt: 'whole' as const },
    { label: 'Days covered', value: this.f.periodDays, fmt: 'number' as const },
  ]);

  protected readonly maxRecipient = computed(() => this.f.topRecipients()[0]?.total ?? 1);
  protected readonly maxTime = computed(() => Math.max(1, ...this.f.timeOfDay().map((t) => t.value)));

  // ---------- Savings analyser ----------
  protected readonly picked = signal<Set<string>>(new Set(['betting', 'fees']));

  protected toggle(id: string) {
    this.picked.update((s) => {
      const next = new Set(s);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  protected readonly monthlySaving = computed(() =>
    this.f.savingsLevers().filter((l) => this.picked().has(l.id)).reduce((a, l) => a + l.perMonth, 0),
  );

  protected readonly monthsToGoal = computed(() => {
    const g = this.f.goal();
    const left = Math.max(0, g.target - g.saved);
    return this.monthlySaving() > 0 ? Math.ceil(left / this.monthlySaving()) : null;
  });

  // ---------- Loans ----------
  protected readonly loans = computed(() =>
    this.f.transactions().filter((t) => t.category === 'loan' || t.category === 'loan-repayment'),
  );
}
