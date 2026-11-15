import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyState } from '../../components/empty-state/empty-state';
import { CATEGORIES } from '../../data/categories';
import { Finance } from '../../services/finance/finance';
import { buildProjectionReport, ScenarioId } from '../../services/finance/projections';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';
import { MoneyPipe } from '../../shared/money';

@Component({
  selector: 'app-outlook',
  imports: [DatePipe, DecimalPipe, TitleCasePipe, RouterLink, EmptyState, Icon, MoneyPipe],
  templateUrl: './outlook.html',
  styleUrl: './outlook.css',
})
export class Outlook {
  protected readonly f = inject(Finance);
  protected readonly icons = ICONS;
  protected readonly categories = CATEGORIES;
  protected readonly abs = Math.abs;
  protected readonly selectedScenarioId = signal<ScenarioId>('current');
  protected readonly report = computed(() => {
    const account = this.f.activeAccount();
    const transactions = this.f.allTransactions().filter(transaction => !account || transaction.accountKey === account.key);
    return transactions.length ? buildProjectionReport(transactions, this.f.statement.availableBalance) : null;
  });
  protected readonly selectedScenario = computed(() => this.report()?.scenarios.find(scenario => scenario.id === this.selectedScenarioId()) ?? this.report()?.scenarios[0] ?? null);
  protected readonly monthlyMax = computed(() => Math.max(1, ...(this.report()?.months.flatMap(month => [month.income, month.spending]) ?? [1])));
  protected readonly ninetyDayValue = computed(() => this.selectedScenario()?.projections.find(projection => projection.days === 90) ?? null);

  protected selectScenario(id: ScenarioId) {
    this.selectedScenarioId.set(id);
  }

  protected horizonDate(days: number): Date {
    const date = new Date(this.report()!.asOf);
    date.setDate(date.getDate() + days);
    return date;
  }
}
