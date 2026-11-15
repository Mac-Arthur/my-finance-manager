import { EmptyState } from '../../components/empty-state/empty-state';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, OnDestroy, signal } from '@angular/core';
import { AreaChart } from '../../components/charts/area-chart';
import { Donut } from '../../components/charts/donut';
import { SERIES, toSlices } from '../../components/charts/slices';
import { Finance } from '../../services/finance/finance';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { MoneyPipe } from '../../shared/money';
import { ICONS } from '../../shared/icons';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-reports',
  imports: [EmptyState, DatePipe, DecimalPipe, RouterLink, MoneyPipe, CountUp, Icon, AreaChart, Donut],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports implements OnDestroy {
  protected readonly f = inject(Finance);
  protected readonly icons = ICONS;
  protected readonly series = SERIES;

  protected readonly showAllCategories = signal(false);
  protected readonly activeSlice = signal<string | null>(null);
  protected readonly month = signal('');
  protected readonly monthOptions = computed(() => {
    const account = this.f.activeAccount();
    const months = new Set(this.f.allTransactions()
      .filter(transaction => !account || transaction.accountKey === account.key)
      .map(transaction => `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, '0')}`));
    return [...months].sort((a, b) => b.localeCompare(a)).map(value => {
      const [year, index] = value.split('-').map(Number);
      return { value, label: new Date(year, index - 1, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }) };
    });
  });
  protected readonly selectedMonth = computed(() => {
    const options = this.monthOptions();
    return options.some(option => option.value === this.month()) ? this.month() : options[0]?.value ?? '';
  });
  protected readonly reviewRange = computed(() => {
    if (!this.selectedMonth()) return null;
    const [year, month] = this.selectedMonth().split('-').map(Number);
    return { from: new Date(year, month - 1, 1), to: new Date(year, month, 0, 23, 59, 59, 999) };
  });
  protected readonly comparison = computed(() => {
    const selected = this.selectedMonth();
    if (!selected) return null;
    const [year, month] = selected.split('-').map(Number);
    const previousDate = new Date(year, month - 2, 1);
    const previousKey = `${previousDate.getFullYear()}-${String(previousDate.getMonth() + 1).padStart(2, '0')}`;
    const account = this.f.activeAccount();
    const previous = this.f.allTransactions().filter(transaction =>
      (!account || transaction.accountKey === account.key) &&
      `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, '0')}` === previousKey &&
      transaction.amount < 0 && transaction.category !== 'own-accounts');
    if (!previous.length) return null;
    const total = previous.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0);
    const change = total ? (this.f.moneyOut() - total) / total : 0;
    return { label: previousDate.toLocaleDateString('en-GH', { month: 'long' }), total, change, count: previous.length };
  });

  constructor() {
    effect(() => this.f.selectedRange.set(this.reviewRange()));
  }

  ngOnDestroy() { this.f.selectedRange.set(null); }

  protected selectMonth(value: string) {
    if (this.monthOptions().some(option => option.value === value)) this.month.set(value);
  }

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

  // ---------- Loans ----------
  protected readonly loans = computed(() =>
    this.f.transactions().filter((t) => t.category === 'loan' || t.category === 'loan-repayment'),
  );
  protected readonly monthHighlights = computed(() => {
    const topCategory = this.f.spendingByCategory()[0];
    const largest = this.f.largestOut();
    const busiest = this.f.daily().reduce<{ date: Date; spent: number } | null>((best, day) => !best || day.spent > best.spent ? day : best, null);
    return [
      topCategory ? { icon: topCategory.icon, label: 'Largest spending category', value: topCategory.total, detail: `${topCategory.label} · ${topCategory.count} transactions` } : null,
      largest ? { icon: this.icons.arrowOut, label: 'Biggest payment', value: Math.abs(largest.amount), detail: largest.name } : null,
      busiest?.spent ? { icon: this.icons.calendar, label: 'Busiest spending day', value: busiest.spent, detail: busiest.date.toLocaleDateString('en-GH', { weekday: 'long', day: 'numeric', month: 'short' }) } : null,
      { icon: this.icons.fee, label: 'Fees captured', value: this.f.allCharges(), detail: this.f.allCharges() ? 'Transaction fees and charge rows' : 'No fees or charges in this month' },
    ].filter((item): item is NonNullable<typeof item> => item !== null);
  });
}
