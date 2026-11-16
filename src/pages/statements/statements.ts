import { StatementReview } from '../../components/statement-review/statement-review';
import { AnalysisDraft } from '../../models/analysis';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { StatementUpload } from '../../components/statement-upload/statement-upload';
import { ImportLoader } from '../../components/import-loader/import-loader';
import { ImportOutcome, Statements as StatementStore } from '../../services/statements/statements';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';
import { ColumnMapper } from '../../components/column-mapper/column-mapper';
import { ColumnMapping } from '../../services/analysis/column-mapping';

@Component({ selector: 'app-statements', imports: [StatementReview, ColumnMapper, StatementUpload, ImportLoader, DatePipe, RouterLink, Icon], templateUrl: './statements.html', styleUrl: './statements.css' })
export class Statements {
  protected readonly store = inject(StatementStore);
  protected readonly icons = ICONS;
  private readonly router = inject(Router);
  protected readonly reviewId = signal<string | null>(null);
  protected readonly review = computed(() => this.store.items().find(item => item.id === this.reviewId() && item.status === 'ready'));
  protected readonly mappingId = signal<string | null>(null);
  protected readonly mapping = computed(() => this.store.items().find(item => item.id === this.mappingId() && item.status === 'mapping' && item.mappingRequest));
  protected readonly removing = signal<string | null>(null);
  constructor() { void this.store.load(); }
  protected async analyse(id: string) {
    this.reviewId.set(null);
    if (await this.store.analyse(id)) this.reviewId.set(id);
    else if (this.store.items().find(item => item.id === id)?.status === 'mapping') this.mappingId.set(id);
  }
  protected async applyMapping(mapping: ColumnMapping) {
    const id = this.mappingId();
    if (!id) return;
    if (await this.store.analyse(id, undefined, mapping)) { this.mappingId.set(null); this.reviewId.set(id); }
  }
  protected async confirm(draft: AnalysisDraft) {
    const id = this.reviewId();
    if (id && await this.store.confirm(id, draft)) {
      this.reviewId.set(null);
      await this.router.navigateByUrl('/home');
    }
  }
  /** Typed into the unlock dialog only; cleared as soon as it is handed to the reader. */
  protected readonly password = signal('');
  protected readonly showPassword = signal(false);
  protected async unlock(event: Event) {
    event.preventDefault();
    const request = this.store.passwordRequest();
    const password = this.password();
    if (!request || !password) return;
    this.password.set('');
    this.showPassword.set(false);
    const result = await this.store.unlock(request.id, password);
    if (result) await this.imported(result);
  }
  protected cancelUnlock() { this.store.passwordRequest.set(null); this.password.set(''); this.showPassword.set(false); }
  protected async imported(result: { id: string; outcome: ImportOutcome }) {
    if (result.outcome === 'imported') await this.router.navigateByUrl('/home');
    else if (result.outcome === 'review') this.reviewId.set(result.id);
    else if (result.outcome === 'mapping') this.mappingId.set(result.id);
  }
  protected async remove(id: string) { await this.store.remove(id); this.removing.set(null); }
}
