import { Onboarding } from '../../services/onboarding/onboarding';
import { EmptyState } from '../../components/empty-state/empty-state';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, computed, effect, inject, signal, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Donut } from '../../components/charts/donut';
import { Ring } from '../../components/charts/ring';
import { BarDatum, SpendBars } from '../../components/charts/spend-bars';
import { toSlices } from '../../components/charts/slices';
import { CATEGORIES } from '../../data/categories';
import { Finance } from '../../services/finance/finance';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { MoneyPipe } from '../../shared/money';
import { ICONS } from '../../shared/icons';


@Component({
  selector: 'app-home',
  imports: [EmptyState, RouterLink, DatePipe, DecimalPipe, MoneyPipe, CountUp, Icon, SpendBars, Donut, Ring],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnDestroy {
  protected readonly f = inject(Finance);
  protected readonly setup = inject(Onboarding);
  protected readonly icons = ICONS;
  protected readonly categories = CATEGORIES;
  protected readonly Math = Math;

  protected readonly period = signal('year');
  protected readonly month = signal('');
  protected readonly currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  protected readonly monthOptions = computed(() => {
    const activeAccount = this.f.activeAccount();
    const months = new Set(
      this.f.allTransactions()
        .filter((transaction) => !activeAccount || transaction.accountKey === activeAccount.key)
        .map((transaction) => `${transaction.date.getFullYear()}-${String(transaction.date.getMonth() + 1).padStart(2, '0')}`)
        .filter((month) => month <= this.currentMonth),
    );

    return [...months]
      .sort((a, b) => b.localeCompare(a))
      .map((value) => {
        const [year, month] = value.split('-').map(Number);
        return {
          value,
          label: new Date(year, month - 1, 1).toLocaleDateString('en-GH', { month: 'long', year: 'numeric' }),
        };
      });
  });
  protected readonly selectedMonth = computed(() => {
    const options = this.monthOptions();
    const selected = this.month();
    if (selected && options.some((option) => option.value === selected)) return selected;

    const latest = this.f.statementMeta()?.to;
    const latestMonth = latest ? `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}` : '';
    return options.find((option) => option.value === latestMonth)?.value ?? options[0]?.value ?? '';
  });
  protected readonly balanceFreshness = computed(() => {
    const accounts = this.f.accounts();
    const active = this.f.activeAccount();
    const updatedAt = active?.latestActivity ?? (accounts.length
      ? new Date(Math.min(...accounts.map((account) => +account.latestActivity)))
      : this.f.statementMeta()?.to);
    if (!updatedAt) return null;

    const today = new Date();
    const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const startUpdated = new Date(updatedAt.getFullYear(), updatedAt.getMonth(), updatedAt.getDate());
    const days = Math.max(0, Math.floor((+startToday - +startUpdated) / 86_400_000));
    const combined = this.f.viewingAllAccounts();
    if (days === 0) return { tone: 'fresh', label: 'Updated today', detail: combined ? 'Every account balance is from today.' : 'Your latest imported balance is from today.' };
    if (days <= 7) return { tone: 'fresh', label: days === 1 ? 'Updated yesterday' : `Updated ${days} days ago`, detail: combined ? 'Based on the oldest account balance.' : 'Recent imported balance.' };
    if (days <= 31) return { tone: 'aging', label: `${days} days old`, detail: combined ? 'At least one account needs a newer statement.' : 'Import a newer statement for a current picture.' };
    const months = Math.max(1, Math.floor(days / 30));
    return { tone: 'stale', label: `${months} month${months === 1 ? '' : 's'} old`, detail: combined ? 'At least one account balance is out of date.' : 'This balance is historical, not current.' };
  });
  protected readonly range = computed(() => {
    const latest = this.f.statementMeta()?.to;
    const anchor = (this.period() === 'quarter' || this.period() === 'year') && latest ? `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}` : this.currentMonth;
    const chosenMonth = this.period() === 'custom' ? this.selectedMonth() : anchor;
    const [year, month] = chosenMonth.split('-').map(Number);
    if (this.period() === 'year') {
      // 1 January of the latest imported year up to the latest imported month.
      return { from: new Date(year, 0, 1), to: new Date(year, month, 0, 23, 59, 59, 999) };
    }
    const offset = this.period() === 'last' ? 1 : 0;
    const endMonth = month - 1 - offset;
    return {
      from: new Date(year, endMonth - (this.period() === 'quarter' ? 2 : 0), 1),
      to: new Date(year, endMonth + 1, 0, 23, 59, 59, 999),
    };
  });

  constructor() {
    effect(() => this.f.selectedRange.set(this.range()));
  }

  ngOnDestroy() { this.f.selectedRange.set(null); }

  protected selectPeriod(value: string) {
    this.period.set(value);
    this.month.set('');
  }

  protected selectMonth(value: string) {
    if (!this.monthOptions().some((option) => option.value === value)) return;
    this.month.set(value);
    this.period.set('custom');
  }

  protected readonly hideBalance = signal(false);
  protected readonly activeSlice = signal<string | null>(null);
  protected readonly activityView = signal<'daily' | 'time'>('daily');

  protected readonly greeting = (() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  protected readonly slices = computed(() => toSlices(this.f.spendingByCategory()));

  /** Daily bars for a month, weekly for a quarter, monthly for a year, so long periods stay readable. */
  protected readonly grouping = computed(() => {
    const days = this.f.daily().length;
    return days > 120 ? 'Monthly' : days > 45 ? 'Weekly' : 'Daily';
  });
  protected readonly dailyBars = computed<BarDatum[]>(() => {
    const days = this.f.daily();
    const grouping = this.grouping();
    if (grouping === 'Daily') return days.map((d) => ({
      label: d.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
      title: d.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      value: d.spent,
    }));
    const buckets = new Map<string, BarDatum>();
    for (const d of days) {
      const start = grouping === 'Monthly' ? new Date(d.date.getFullYear(), d.date.getMonth(), 1)
        : new Date(d.date.getFullYear(), d.date.getMonth(), d.date.getDate() - ((d.date.getDay() + 6) % 7)); // Monday
      const key = start.toDateString();
      const bucket = buckets.get(key) ?? {
        label: start.toLocaleDateString('en-GB', grouping === 'Monthly' ? { month: 'short' } : { day: 'numeric', month: 'short' }),
        title: grouping === 'Monthly' ? start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : `Week of ${start.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`,
        value: 0,
      };
      bucket.value += d.spent;
      buckets.set(key, bucket);
    }
    return [...buckets.values()];
  });

  protected readonly timeBars = computed<BarDatum[]>(() =>
    this.f.timeOfDay().map((b) => ({ label: b.label, title: `${b.label} · ${b.range}`, value: b.value })),
  );

  protected readonly recent = computed(() =>
    this.f.transactions().slice(0, 5).map((t) => ({ ...t, cat: CATEGORIES[t.category] })),
  );

  /** Biggest ratio for the rings so they're comparable to each other. */
  protected readonly flowMax = computed(() =>
    Math.max(this.f.moneyIn(), this.f.moneyOut() + this.f.fees(), 1),
  );

  protected initials(name: string) {
    return name
      .split(/\s+/)
      .filter((w) => /^[a-z]/i.test(w))
      .slice(0, 2)
      .map((w) => w[0].toUpperCase())
      .join('');
  }
}
