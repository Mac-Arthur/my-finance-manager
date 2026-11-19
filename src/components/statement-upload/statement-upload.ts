import { Component, inject, output, signal } from '@angular/core';
import { ImportOutcome, Statements } from '../../services/statements/statements';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({ selector: 'app-statement-upload', imports: [Icon], templateUrl: './statement-upload.html', styleUrl: './statement-upload.css' })
export class StatementUpload {
  protected readonly statements = inject(Statements);
  protected readonly icons = ICONS;
  protected readonly maxFiles = 3;
  protected readonly selected = signal<File[]>([]);
  protected readonly dragging = signal(false);
  protected readonly message = signal('');

  protected choose(files: FileList | null) {
    if (this.statements.busy()) return;
    this.message.set('');
    this.statements.error.set('');
    if (!files?.length) return;
    const next = [...this.selected()];
    const left: string[] = [];
    for (const file of Array.from(files)) {
      if (next.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) continue;
      if (next.length >= this.maxFiles) left.push(file.name); else next.push(file);
    }
    this.selected.set(next);
    if (left.length) this.statements.error.set(`Only ${this.maxFiles} statements at a time. Left out: ${left.join(', ')}.`);
  }
  protected removeFile(index: number) { this.selected.update(list => list.filter((_, i) => i !== index)); }
  protected drop(event: DragEvent) {
    event.preventDefault(); this.dragging.set(false); this.choose(event.dataTransfer?.files ?? null);
  }
  /** Emits the saved statement and whether it reached the dashboard or needs a review. */
  readonly imported = output<{ id: string; outcome: ImportOutcome }>();
  protected async save() {
    const queue = [...this.selected()];
    const run = await this.statements.importFiles(queue);
    if (!run) return;
    this.selected.set([]);
    if (run.attention.length) {
      const n = run.attention.length;
      this.message.set(`${run.imported ? run.imported + ' imported. ' : ''}${n} ${n === 1 ? 'statement needs' : 'statements need'} a quick look. ${n === 1 ? 'It is' : 'They are'} saved in your library.`);
    }
    if (run.last) this.imported.emit(run.last);
  }
}
