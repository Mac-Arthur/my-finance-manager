import { AnalysisDraft } from '../../models/analysis';
import { PasswordRequiredError, STATEMENT_ANALYSER } from '../analysis/statement-analyser';
import { assertCompatible } from '../analysis/ledger';
import { validateDraft } from '../analysis/parse-statement';
import { Injectable, computed, inject, signal } from '@angular/core';
import { environment } from '../../environments/environment';
import { CATEGORIES } from '../../data/categories';
import { CategoryId, CurrencyCode } from '../../models/finance';

export interface SavedStatement {
  id: string;
  name: string;
  size: number;
  kind: 'pdf' | 'csv';
  addedAt: string;
  status: 'awaiting-analysis' | 'ready' | 'confirmed' | 'error';
  draft?: AnalysisDraft;
  analysisError?: string;
  file: Blob;
}

export type ImportOutcome = 'imported' | 'review' | 'error' | 'password';
export type ImportStage = 'reading' | 'extracting' | 'sorting' | 'building' | 'done';
export interface ImportSummary {
  count: number; from: string; to: string; moneyIn: number; moneyOut: number; balance: number | null;
  currency: CurrencyCode;
  /** True when every running balance adds up, false when some don't, null when the file has no balances. */
  verified: boolean | null;
  categories: { id: CategoryId; label: string; count: number }[];
}
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, Math.max(0, ms)));
function summarise(draft: AnalysisDraft): ImportSummary {
  const rows = [...draft.rows].sort((a, b) => a.date.localeCompare(b.date));
  const counts = new Map<CategoryId, number>();
  for (const row of rows) counts.set(row.category, (counts.get(row.category) ?? 0) + 1);
  return {
    count: rows.length, from: rows[0].date, to: rows.at(-1)!.date, currency: draft.currency,
    moneyIn: rows.filter(r => r.amountMinor > 0).reduce((sum, r) => sum + r.amountMinor, 0) / 100,
    moneyOut: -rows.filter(r => r.amountMinor < 0).reduce((sum, r) => sum + r.amountMinor, 0) / 100,
    balance: rows.at(-1)!.balanceMinor === null ? null : rows.at(-1)!.balanceMinor! / 100,
    verified: draft.balanceCheck ? draft.balanceCheck.breaks === 0 : null,
    categories: [...counts].sort((a, b) => b[1] - a[1]).map(([id, count]) => ({ id, label: CATEGORIES[id].label, count })),
  };
}

@Injectable({ providedIn: 'root' })
export class Statements {
  private readonly analyser = inject(STATEMENT_ANALYSER);
  readonly analysingId = signal<string | null>(null);
  readonly confirmed = computed(() => this.items().filter((item): item is SavedStatement & { draft: AnalysisDraft } => item.status === 'confirmed' && !!item.draft).slice().sort((a, b) => a.addedAt.localeCompare(b.addedAt)));
  readonly items = signal<SavedStatement[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly progress = signal('');
  private database?: Promise<IDBDatabase>;

  private open(): Promise<IDBDatabase> {
    if (!this.database) {
      this.database = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open('mysika', environment.storageVersion);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('statements')) db.createObjectStore('statements', { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(new Error('Could not open local storage. Check your browser storage settings.'));
        request.onblocked = () => reject(new Error('Close other myAvailable tabs and try again.'));
      }).catch(error => { this.database = undefined; throw error; });
    }
    return this.database;
  }

  private async all(): Promise<SavedStatement[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('statements', 'readonly');
      const request = tx.objectStore('statements').getAll();
      tx.oncomplete = () => resolve(request.result.sort((a: SavedStatement, b: SavedStatement) => b.addedAt.localeCompare(a.addedAt)));
      tx.onerror = tx.onabort = () => reject(new Error('Could not read your saved statements. Please try again.'));
    });
  }

  async load() {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try { this.items.set(await this.all()); }
    catch (error) { this.fail(error); }
    finally { this.loading.set(false); }
  }

  readonly importing = signal(false);
  /** Drives the import animation. The stages are paced so people can follow what happened to their file. */
  readonly importStage = signal<ImportStage>('reading');
  readonly importSummary = signal<ImportSummary | null>(null);
  /** Set when a saved PDF needs its password before it can be read. */
  readonly passwordRequest = signal<{ id: string; name: string; incorrect: boolean } | null>(null);

  async save(file: File): Promise<boolean> { return !!(await this.saveFile(file)); }

  /**
   * One step from file to dashboard: save, analyse, then confirm with the detected account label.
   * Falls back to the review screen when the label is unknown or the import conflicts with earlier ones.
   */
  async importFile(file: File): Promise<{ id: string; outcome: ImportOutcome } | null> {
    if (this.busy() || this.importing()) return null;
    this.startImport();
    try {
      const id = await this.saveFile(file);
      return id ? await this.runImport(id) : null;
    } finally { this.importing.set(false); }
  }

  /** Continue a saved, password-protected PDF. The password is passed straight to the reader and never stored. */
  async unlock(id: string, password: string): Promise<{ id: string; outcome: ImportOutcome } | null> {
    if (this.busy() || this.importing()) return null;
    this.passwordRequest.set(null);
    this.startImport();
    try { return await this.runImport(id, password); }
    finally { this.importing.set(false); }
  }

  private startImport() {
    this.importStage.set('reading');
    this.importSummary.set(null);
    this.importing.set(true);
  }

  private async runImport(id: string, password?: string): Promise<{ id: string; outcome: ImportOutcome }> {
    const started = Date.now();
    if (!await this.analyse(id, password)) return { id, outcome: this.passwordRequest()?.id === id ? 'password' : 'error' };
    const draft = structuredClone(this.items().find(item => item.id === id)?.draft);
    if (!draft) return { id, outcome: 'error' };
    await pause(1400 - (Date.now() - started));
    this.importSummary.set(summarise(draft));
    this.importStage.set('extracting');
    await pause(1300);
    this.importStage.set('sorting');
    await pause(1700);
    // A misread layout breaks the running balance on a large share of rows; a few breaks are provider quirks
    // (airtime bought on credit, same-minute entries). Above 5%, a person checks before anything is imported.
    if (draft.balanceCheck && draft.balanceCheck.breaks > Math.max(2, draft.rows.length * 0.05)) return { id, outcome: 'review' };
    if (draft.warnings.some(warning => warning.startsWith('No currency label was found'))) return { id, outcome: 'review' };
    if (!draft.account.trim()) {
      // Without a detected wallet, only the very first import can safely get a default label.
      if (this.confirmed().length) return { id, outcome: 'review' };
      draft.account = 'My wallet';
    }
    this.importStage.set('building');
    const [confirmed] = await Promise.all([this.confirm(id, draft), pause(1300)]);
    if (!confirmed) return { id, outcome: 'review' };
    this.importStage.set('done');
    await pause(1100);
    return { id, outcome: 'imported' };
  }

  private async saveFile(file: File): Promise<string | null> {
    if (this.busy()) return null;
    this.busy.set(true);
    this.error.set('');
    this.progress.set('Reading your file…');
    try {
      const kind = file.name.split('.').pop()?.toLowerCase();
      if (kind !== 'pdf' && kind !== 'csv') throw new Error('Choose a PDF or CSV statement.');
      if (!file.size) throw new Error('This file is empty. Choose another statement.');
      if (file.size > environment.maxStatementBytes) throw new Error(`Choose a file smaller than ${environment.maxStatementBytes / 1024 / 1024} MB.`);
      if (!globalThis.crypto?.subtle) {
        throw new Error('Secure file checking is unavailable on this connection. Open myAvailable with HTTPS, or use localhost on this device, then try again.');
      }
      const bytes = await file.arrayBuffer();
      const start = new TextDecoder().decode(bytes.slice(0, 1024));
      if (kind === 'pdf' && !start.startsWith('%PDF-')) throw new Error('This file does not appear to be a PDF. Please export it again.');
      if (kind === 'csv' && (start.includes('\u0000') || !/[,;\t]/.test(start))) throw new Error('This CSV does not contain recognisable columns. Please export a CSV with column headers.');
      this.progress.set('Checking for duplicate files…');
      const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
      const id = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
      const existing = await this.all();
      if (existing.some(item => item.id === id)) throw new Error('This statement is already saved. You can find it below.');
      if (existing.length >= environment.maxStatements) throw new Error('Your local inbox is full. Download and remove an older file before adding another.');
      this.progress.set('Saving to this browser…');
      const item: SavedStatement = { id, name: file.name, size: file.size, kind, addedAt: new Date().toISOString(), status: 'awaiting-analysis', file: new Blob([bytes], { type: kind === 'pdf' ? 'application/pdf' : 'text/csv' }) };
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('statements', 'readwrite');
        tx.objectStore('statements').add(item);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('Could not save this file. Storage may be full or the statement may already exist.'));
      });
      this.items.set(await this.all());
      return id;
    } catch (error) { this.fail(error); return null; }
    finally { this.busy.set(false); this.progress.set(''); }
  }

  private async put(item: SavedStatement) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('statements', 'readwrite');
      tx.objectStore('statements').put(item);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Could not save analysis. Check available browser storage and retry.'));
    });
    this.items.set(await this.all());
  }

  async analyse(id: string, password?: string): Promise<boolean> {
    if (this.busy()) return false;
    const item = this.items().find(item => item.id === id);
    if (!item || item.status === 'confirmed') return false;
    this.busy.set(true);
    this.analysingId.set(id);
    this.error.set('');
    try {
      const draft = await this.analyser.analyse({ kind: item.kind, file: item.file, password }, message => this.progress.set(message));
      validateDraft(draft, false);
      await this.put({ ...item, draft, status: 'ready', analysisError: undefined });
      return true;
    } catch (error) {
      if (error instanceof PasswordRequiredError) this.passwordRequest.set({ id, name: item.name, incorrect: error.incorrect });
      else this.fail(error);
      try { await this.put({ ...item, status: 'error', analysisError: error instanceof Error ? error.message : this.error(), draft: undefined }); }
      catch { /* Preserve the original analysis error and allow retry. */ }
      return false;
    } finally { this.busy.set(false); this.analysingId.set(null); this.progress.set(''); }
  }

  async confirm(id: string, draft: AnalysisDraft): Promise<boolean> {
    if (this.busy()) return false;
    const item = this.items().find(item => item.id === id);
    if (!item || item.status !== 'ready') return false;
    this.busy.set(true);
    this.error.set('');
    try {
      validateDraft(draft);
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('statements', 'readwrite');
        const store = tx.objectStore('statements');
        const request = store.getAll();
        request.onsuccess = () => {
          try {
            const persisted = request.result as SavedStatement[];
            const current = persisted.find(record => record.id === id);
            if (!current || current.status !== 'ready') throw new Error('This statement changed in another tab. Reload the library and try again.');
            const confirmed = persisted.filter((record): record is SavedStatement & { draft: AnalysisDraft } => record.status === 'confirmed' && !!record.draft);
            assertCompatible(draft, confirmed);
            store.put({ ...current, draft: structuredClone(draft), status: 'confirmed' });
          } catch (error) { tx.abort(); reject(error); }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('Could not confirm the statement. Please retry.'));
      });
      this.items.set(await this.all());
      return true;
    } catch (error) { this.fail(error); return false; }
    finally { this.busy.set(false); }
  }

  async remove(id: string) {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const db = await this.open();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('statements', 'readwrite');
        tx.objectStore('statements').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = tx.onabort = () => reject(new Error('Could not remove the file. Please try again.'));
      });
      this.items.set(await this.all());
    } catch (error) { this.fail(error); }
    finally { this.busy.set(false); }
  }

  /** Complete local snapshot used only by encrypted backup. */
  async exportAll(): Promise<SavedStatement[]> {
    return this.all();
  }

  /** Atomically replaces the statement store after a backup has been fully decrypted and validated. */
  async replaceAll(records: SavedStatement[]) {
    const db = await this.open();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('statements', 'readwrite');
      const store = tx.objectStore('statements');
      store.clear();
      for (const record of records) store.put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(new Error('Could not replace local statements. Your previous data was kept where possible.'));
    });
    this.items.set(await this.all());
  }

  async clearAll() {
    await this.replaceAll([]);
  }

  download(item: SavedStatement) {
    const url = URL.createObjectURL(item.file);
    const link = document.createElement('a');
    link.href = url; link.download = item.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private fail(error: unknown) {
    this.error.set(error instanceof Error ? error.message : 'Something went wrong. Please try again.');
  }
}
