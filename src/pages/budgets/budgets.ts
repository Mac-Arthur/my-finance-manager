import { EmptyState } from '../../components/empty-state/empty-state';
import { DecimalPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Ring } from '../../components/charts/ring';
import { CategoryId } from '../../models/finance';
import { Finance } from '../../services/finance/finance';
import { CountUp } from '../../shared/count-up';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';
import { MoneyPipe } from '../../shared/money';

@Component({
  selector: 'app-budgets',
  imports: [EmptyState, DecimalPipe, MoneyPipe, CountUp, Icon, Ring],
  templateUrl: './budgets.html',
  styleUrl: './budgets.css',
})
export class Budgets {
  protected readonly f = inject(Finance);
  protected readonly icons = ICONS;

  protected readonly adding = signal(false);

  protected readonly totals = computed(() => {
    const list = this.f.budgetProgress();
    const limit = list.reduce((a, b) => a + b.limit, 0);
    const spent = list.reduce((a, b) => a + b.spent, 0);
    return { limit, spent, ratio: limit ? spent / limit : 0, over: list.filter((b) => b.status === 'over').length };
  });

  protected readonly goalRatio = computed(() => {
    const g = this.f.goal();
    return g.target ? Math.min(1, g.saved / g.target) : 0;
  });

  protected updateLimit(category: CategoryId, raw: string) {
    const limit = Number(raw);
    if (Number.isFinite(limit) && limit >= 0) this.f.setBudget(category, Math.round(limit));
  }

  protected addBudget(category: string) {
    if (!category) return;
    const spent = this.f.spendingByCategory().find((c) => c.id === category)?.total ?? 0;
    // Suggest a limit a bit under current spend, rounded to the nearest 50.
    this.f.setBudget(category as CategoryId, Math.max(50, Math.round((spent * 0.9) / 50) * 50));
    this.adding.set(false);
  }

  protected updateGoal(patch: Partial<{ name: string; target: number; saved: number }>) {
    this.f.goal.update((g) => ({ ...g, ...patch }));
  }

  protected deposit(amount: number) {
    this.f.goal.update((g) => ({ ...g, saved: Math.max(0, g.saved + amount) }));
  }
}
