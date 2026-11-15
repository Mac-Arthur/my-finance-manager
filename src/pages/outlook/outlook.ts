import { DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ForecastChart } from '../../components/charts/forecast-chart';
import { EmptyState } from '../../components/empty-state/empty-state';
import { CATEGORIES } from '../../data/categories';
import { Finance } from '../../services/finance/finance';
import { dayNumber, safeToSpend, simulateForecast } from '../../services/finance/forecast';
import { buildProjectionReport, ScenarioId } from '../../services/finance/projections';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';
import { MoneyPipe } from '../../shared/money';

@Component({
  selector: 'app-outlook',
  imports: [DatePipe, DecimalPipe, TitleCasePipe, RouterLink, EmptyState, ForecastChart, Icon, MoneyPipe],
  templateUrl: './outlook.html',
  styleUrl: './outlook.css',
})
export class Outlook {
  protected readonly f = inject(Finance);
  protected readonly icons = ICONS;
  protected readonly categories = CATEGORIES;
  protected readonly abs = Math.abs;
  protected readonly round = Math.round;
  protected readonly selectedScenarioId = signal<ScenarioId>('current');
  /** Share cut from everyday spending in the spend-less example. */
  protected readonly trim = signal(.1);
  /** Regular items the user chose to leave out of the path. Not saved. */
  protected readonly excluded = signal<ReadonlySet<string>>(new Set());
  protected readonly report = computed(() => {
    const account = this.f.activeAccount();
    const transactions = this.f.allTransactions().filter(transaction => !account || transaction.accountKey === account.key);
    return transactions.length ? buildProjectionReport(transactions, this.f.statement.availableBalance) : null;
  });
  protected readonly monthlyMax = computed(() => Math.max(1, ...(this.report()?.months.flatMap(month => [month.income, month.spending]) ?? [1])));

  /** Path with nothing changed, used for the comparison line. */
  private readonly currentPath = computed(() => {
    const report = this.report();
    return report ? simulateForecast(report.model, { start: report.latestBalance, excluded: this.excluded() }) : null;
  });
  protected readonly forecast = computed(() => {
    const report = this.report();
    const id = this.selectedScenarioId();
    if (!report || id === 'current') return this.currentPath();
    return simulateForecast(report.model, { start: report.latestBalance, excluded: this.excluded(), trim: id === 'better' ? this.trim() : 0, growth: id === 'higher' ? .1 : 0 });
  });
  protected readonly checkpoints = computed(() => this.forecast()?.days.filter(day => day.day > 0 && day.day % 30 === 0) ?? []);
  /** A compact decision layer for the scenario switcher. */
  protected readonly scenarioChoices = computed(() => {
    const report = this.report();
    const current = this.currentPath();
    if (!report || !current) return [];
    const paths = {
      current,
      better: simulateForecast(report.model, { start: report.latestBalance, excluded: this.excluded(), trim: this.trim() }),
      higher: simulateForecast(report.model, { start: report.latestBalance, excluded: this.excluded(), growth: .1 }),
    };
    const currentEnd = current.days.at(-1)?.mid ?? 0;
    return report.scenarios.map(scenario => {
      const path = paths[scenario.id];
      const end = path.days.at(-1)!;
      return { ...scenario, end, difference: end.mid - currentEnd };
    });
  });
  protected readonly selectedChoice = computed(() => this.scenarioChoices().find(choice => choice.id === this.selectedScenarioId()) ?? this.scenarioChoices()[0] ?? null);
  protected readonly currentOutcome = computed(() => {
    const path = this.currentPath();
    if (!path) return null;
    const start = path.days[0];
    const end = path.days.at(-1)!;
    return { start, end, change: end.mid - start.mid, zero: path.zeroDay === null ? null : path.days[path.zeroDay] };
  });
  /** First day the middle estimate holds one typical month of spending. */
  protected readonly bufferDay = computed(() => {
    const report = this.report();
    const days = this.forecast()?.days;
    if (!report || !days || report.latestBalance === null || report.baselineSpending <= 0 || days[0].mid >= report.baselineSpending) return null;
    return days.find(day => day.mid >= report.baselineSpending) ?? null;
  });
  protected readonly safe = computed(() => {
    const report = this.report();
    return report ? safeToSpend(report.model, report.latestBalance, this.excluded()) : null;
  });
  /** Whole days between the statement's last day and today. */
  protected readonly staleDays = computed(() => {
    const report = this.report();
    return report ? Math.max(0, dayNumber(new Date()) - dayNumber(report.asOf)) : 0;
  });
  protected readonly upcoming = computed(() => {
    const events = (this.report()?.model.events ?? []).filter(event => event.day <= 30 && !this.excluded().has(event.flowId));
    const total = (direction: 'in' | 'out') => events.filter(event => event.direction === direction).reduce((sum, event) => sum + event.amount, 0);
    return { in: total('in'), out: total('out') };
  });

  protected selectScenario(id: ScenarioId) {
    this.selectedScenarioId.set(id);
  }

  protected setTrim(event: Event) {
    this.trim.set(+(event.target as HTMLInputElement).value / 100);
  }

  protected toggleFlow(id: string) {
    this.excluded.update(current => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }
}
