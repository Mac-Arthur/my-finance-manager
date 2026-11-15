import { EmptyState } from '../../components/empty-state/empty-state';
import { DatePipe } from '@angular/common';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CATEGORIES } from '../../data/categories';
import { CategoryId, Transaction } from '../../models/finance';
import { Finance } from '../../services/finance/finance';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';
import { MoneyPipe } from '../../shared/money';

@Component({
  selector: 'app-transactions',
  imports: [EmptyState, DatePipe, MoneyPipe, Icon],
  templateUrl: './transactions.html',
  styleUrl: './transactions.css',
})
export class Transactions {
  private readonly pageSize = 50;
  protected readonly f = inject(Finance);
  protected readonly icons = ICONS;
  protected readonly Math = Math;

  protected readonly query = signal('');
  protected readonly direction = signal<'all' | 'in' | 'out'>('all');
  protected readonly category = signal<CategoryId | null>(null);
  protected readonly filterOpen = signal(false);
  protected readonly draftDirection = signal<'all' | 'in' | 'out'>('all');
  protected readonly draftCategory = signal<CategoryId | null>(null);
  protected readonly selectedTransactionId = signal<string | null>(null);
  protected readonly editorCategory = signal<CategoryId | null>(null);
  protected readonly teachSimilar = signal(false);
  protected readonly visibleLimit = signal(this.pageSize);

  protected readonly selectedTransaction = computed(() => {
    const id = this.selectedTransactionId();
    return id ? this.f.allTransactions().find(transaction => transaction.id === id) ?? null : null;
  });

  protected readonly editorCategories = computed(() => {
    const transaction = this.selectedTransaction();
    if (!transaction) return [];
    const kind = transaction.amount > 0 ? 'in' : 'out';
    return Object.values(CATEGORIES).filter(category => category.kind === kind);
  });

  protected readonly selectedCategorySource = computed(() => {
    const transaction = this.selectedTransaction();
    return transaction ? this.f.categorySource(transaction.id) : 'import';
  });

  protected readonly selectedRule = computed(() => {
    const transaction = this.selectedTransaction();
    return transaction ? this.f.categoryRuleFor(transaction.id) : null;
  });

  protected readonly similarCount = computed(() => {
    const transaction = this.selectedTransaction();
    return transaction ? this.f.similarTransactionCount(transaction.id) : 0;
  });

  /** Only categories that actually appear, most-used first. */
  protected readonly categoryChips = computed(() => {
    const counts = new Map<CategoryId, number>();
    for (const t of this.f.transactions()) counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, count]) => ({ ...CATEGORIES[id], count }));
  });

  protected readonly activeFilterCount = computed(
    () => (this.direction() === 'all' ? 0 : 1) + (this.category() ? 1 : 0),
  );

  protected readonly draftResultCount = computed(() => {
    const dir = this.draftDirection();
    const cat = this.draftCategory();
    return this.f.transactions().filter(
      (t) =>
        (dir === 'all' || (dir === 'in' ? t.amount > 0 : t.amount < 0)) &&
        (!cat || t.category === cat),
    ).length;
  });

  protected readonly filtered = computed(() => {
    const q = this.query().trim().toLowerCase();
    const dir = this.direction();
    const cat = this.category();
    return this.f.transactions().filter(
      (t) =>
        (dir === 'all' || (dir === 'in' ? t.amount > 0 : t.amount < 0)) &&
        (!cat || t.category === cat) &&
        (!q || `${t.name} ${t.reference} ${CATEGORIES[t.category].label}`.toLowerCase().includes(q)),
    );
  });

  protected readonly visibleTransactions = computed(() => this.filtered().slice(0, this.visibleLimit()));
  protected readonly hasMore = computed(() => this.visibleTransactions().length < this.filtered().length);

  protected readonly groups = computed(() => {
    const dayTotals = new Map<string, number>();
    for (const transaction of this.filtered()) {
      const key = transaction.date.toDateString();
      dayTotals.set(key, (dayTotals.get(key) ?? 0) + transaction.amount);
    }
    const map = new Map<string, { date: Date; items: Transaction[]; net: number }>();
    for (const t of this.visibleTransactions()) {
      const key = t.date.toDateString();
      const g = map.get(key) ?? { date: t.date, items: [], net: dayTotals.get(key) ?? 0 };
      g.items.push(t);
      map.set(key, g);
    }
    return [...map.values()];
  });

  protected readonly totalShown = computed(() => this.filtered().reduce((a, t) => a + t.amount, 0));

  constructor() {
    effect(() => {
      this.query();
      this.direction();
      this.category();
      this.f.accountSelection();
      this.visibleLimit.set(this.pageSize);
    });
  }

  protected showMore() {
    this.visibleLimit.update(limit => limit + this.pageSize);
  }

  protected openFilters() {
    this.draftDirection.set(this.direction());
    this.draftCategory.set(this.category());
    this.filterOpen.set(true);
  }

  protected closeFilters() {
    this.filterOpen.set(false);
  }

  protected applyFilters() {
    this.direction.set(this.draftDirection());
    this.category.set(this.draftCategory());
    this.closeFilters();
  }

  protected clearDraftFilters() {
    this.draftDirection.set('all');
    this.draftCategory.set(null);
  }

  protected openTransaction(transaction: Transaction) {
    this.filterOpen.set(false);
    this.selectedTransactionId.set(transaction.id);
    this.editorCategory.set(transaction.category);
    this.teachSimilar.set(false);
  }

  protected closeTransaction() {
    this.selectedTransactionId.set(null);
    this.editorCategory.set(null);
    this.teachSimilar.set(false);
  }

  protected saveTransactionCategory() {
    const transaction = this.selectedTransaction();
    const category = this.editorCategory();
    if (!transaction || !category) return;
    if (this.f.setTransactionCategory(transaction.id, category, this.teachSimilar())) this.closeTransaction();
  }

  protected resetTransactionCategory() {
    const transaction = this.selectedTransaction();
    if (!transaction) return;
    this.f.resetTransactionCategory(transaction.id);
    this.editorCategory.set(this.f.allTransactions().find(row => row.id === transaction.id)?.category ?? transaction.category);
    this.teachSimilar.set(false);
  }

  protected removeSelectedRule() {
    const rule = this.selectedRule();
    if (!rule) return;
    this.f.removeCategoryRule(rule.key);
    const transaction = this.selectedTransaction();
    if (transaction) this.editorCategory.set(this.f.allTransactions().find(row => row.id === transaction.id)?.category ?? transaction.category);
    this.teachSimilar.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape() {
    this.closeFilters();
    this.closeTransaction();
  }

  protected cat(id: CategoryId) {
    return CATEGORIES[id];
  }
}
