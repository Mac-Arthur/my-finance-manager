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

  protected readonly period = signal('quarter');
  protected readonly month = signal('');
  protected readonly currentMonth = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  })();
  protected readonly range = computed(() => {
    const latest = this.f.statementMeta()?.to;
    const anchor = (this.period() === 'quarter' || this.period() === 'year') && latest ? `${latest.getFullYear()}-${String(latest.getMonth() + 1).padStart(2, '0')}` : this.currentMonth;
    const [year, month] = (this.month() || anchor).split('-').map(Number);
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
    if (!/^\d{4}-\d{2}$/.test(value) || value > this.currentMonth) return;
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

  protected readonly goalRatio = computed(() => {
    const g = this.f.goal();
    return g.target ? g.saved / g.target : 0;
  });

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
