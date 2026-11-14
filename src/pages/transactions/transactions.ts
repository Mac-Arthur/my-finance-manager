import { EmptyState } from '../../components/empty-state/empty-state';
import { DatePipe } from '@angular/common';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
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
  protected readonly f = inject(Finance);
  protected readonly icons = ICONS;

  protected readonly query = signal('');
  protected readonly direction = signal<'all' | 'in' | 'out'>('all');
  protected readonly category = signal<CategoryId | null>(null);
  protected readonly filterOpen = signal(false);
  protected readonly draftDirection = signal<'all' | 'in' | 'out'>('all');
  protected readonly draftCategory = signal<CategoryId | null>(null);

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

  protected readonly groups = computed(() => {
    const map = new Map<string, { date: Date; items: Transaction[]; net: number }>();
    for (const t of this.filtered()) {
      const key = t.date.toDateString();
      const g = map.get(key) ?? { date: t.date, items: [], net: 0 };
      g.items.push(t);
      g.net += t.amount;
      map.set(key, g);
    }
    return [...map.values()];
  });

  protected readonly totalShown = computed(() => this.filtered().reduce((a, t) => a + t.amount, 0));

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

  @HostListener('document:keydown.escape')
  protected onEscape() {
    this.closeFilters();
  }

  protected cat(id: CategoryId) {
    return CATEGORIES[id];
  }
}
