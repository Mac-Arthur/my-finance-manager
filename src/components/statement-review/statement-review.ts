import { Component, computed, input, linkedSignal, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AnalysisDraft, AnalysisRow } from '../../models/analysis';
import { CATEGORIES } from '../../data/categories';
import { MoneyPipe } from '../../shared/money';
import { moneyMinor, parseDate, SUPPORTED_CURRENCIES, validateDraft } from '../../services/analysis/parse-statement';
import { CurrencyCode } from '../../models/finance';

@Component({ selector: 'app-statement-review', imports: [FormsModule, MoneyPipe], templateUrl: './statement-review.html', styleUrl: './statement-review.css' })
export class StatementReview {
  readonly draft = input.required<AnalysisDraft>();
  readonly busy = input(false);
  readonly confirm = output<AnalysisDraft>();
  readonly close = output<void>();
  protected readonly edited = linkedSignal(() => structuredClone(this.draft()));
  protected readonly page = signal(0);
  protected readonly fieldErrors = signal<Record<string, string>>({});
  protected readonly error = signal('');
  protected readonly categories = Object.values(CATEGORIES);
  protected readonly currencies = SUPPORTED_CURRENCIES;
  protected readonly visibleRows = computed(() => this.edited().rows.slice(this.page() * 25, (this.page() + 1) * 25));
  protected readonly pages = computed(() => Math.ceil(this.edited().rows.length / 25));
  protected readonly incoming = computed(() => this.edited().rows.filter(r => r.amountMinor > 0).reduce((sum, r) => sum + r.amountMinor, 0) / 100);
  protected readonly outgoing = computed(() => -this.edited().rows.filter(r => r.amountMinor < 0).reduce((sum, r) => sum + r.amountMinor, 0) / 100);
  protected readonly fees = computed(() => this.edited().rows.reduce((sum, r) => sum + r.feeMinor, 0) / 100);
  protected readonly errors = computed(() => Object.values(this.fieldErrors()));

  protected account(value: string) { this.edited.update(draft => ({ ...draft, account: value })); }
  protected currency(value: string) {
    if (this.currencies.includes(value as CurrencyCode)) this.edited.update(draft => ({
      ...draft,
      currency: value as CurrencyCode,
      warnings: draft.warnings.filter(warning => !warning.startsWith('No currency label was found')),
    }));
  }
  protected change(index: number, field: keyof AnalysisRow, value: string) {
    const rowIndex = this.page() * 25 + index;
    const key = `${rowIndex}:${field}`;
    try {
      let parsed: string | number | null = value;
      if (field === 'amountMinor' || field === 'feeMinor' || field === 'balanceMinor') parsed = field === 'balanceMinor' && !value.trim() ? null : moneyMinor(value);
      if (field === 'date') parsed = parseDate(value);
      this.edited.update(draft => ({ ...draft, rows: draft.rows.map((row, i) => i === rowIndex ? { ...row, [field]: parsed } : row) }));
      this.fieldErrors.update(errors => { const updated = { ...errors }; delete updated[key]; return updated; });
    } catch (error) { this.fieldErrors.update(errors => ({ ...errors, [key]: `Row ${rowIndex + 1}: ${error instanceof Error ? error.message : 'Invalid value'}` })); }
  }
  protected submit() {
    if (this.busy() || this.errors().length) return;
    this.error.set('');
    try { validateDraft(this.edited()); this.confirm.emit(this.edited()); }
    catch (error) { this.error.set(error instanceof Error ? error.message : 'Check the draft before confirming.'); }
  }
}
