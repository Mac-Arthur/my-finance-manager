import { Component, inject, output, signal } from '@angular/core';
import { ImportOutcome, Statements } from '../../services/statements/statements';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({ selector: 'app-statement-upload', imports: [Icon], templateUrl: './statement-upload.html', styleUrl: './statement-upload.css' })
export class StatementUpload {
  protected readonly statements = inject(Statements);
  protected readonly icons = ICONS;
  protected readonly selected = signal<File | null>(null);
  protected readonly dragging = signal(false);
  protected readonly message = signal('');

  protected choose(files: FileList | null) {
    if (this.statements.busy()) return;
    this.message.set('');
    this.statements.error.set('');
    if (files && files.length > 1) { this.statements.error.set('Add one statement at a time.'); return; }
    this.selected.set(files?.[0] ?? null);
  }
  protected drop(event: DragEvent) {
    event.preventDefault(); this.dragging.set(false); this.choose(event.dataTransfer?.files ?? null);
  }
  /** Emits the saved statement and whether it reached the dashboard or needs a review. */
  readonly imported = output<{ id: string; outcome: ImportOutcome }>();
  protected async save() {
    const file = this.selected();
    if (!file) return;
    const result = await this.statements.importFile(file);
    if (!result) return;
    this.selected.set(null);
    if (result.outcome === 'review') this.message.set('Statement read. Check the details below to finish importing.');
    this.imported.emit(result);
  }
}
