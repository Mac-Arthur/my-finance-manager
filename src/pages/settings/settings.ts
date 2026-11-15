import { RouterLink } from '@angular/router';
import { Theme } from '../../services/theme/theme';
import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Onboarding } from '../../services/onboarding/onboarding';
import { Statements } from '../../services/statements/statements';
import { Finance } from '../../services/finance/finance';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';
import { DataBackup } from '../../services/backup/backup';
import { environment } from '../../environments/environment';

@Component({
  selector: 'app-settings',
  imports: [RouterLink, DatePipe, Icon],
  templateUrl: './settings.html',
  styleUrl: './settings.css',
})
export class Settings {
  protected readonly theme = inject(Theme);
  protected readonly setup = inject(Onboarding);
  protected readonly statements = inject(Statements);
  protected readonly finance = inject(Finance);
  protected readonly icons = ICONS;
  protected readonly backup = inject(DataBackup);
  protected readonly dataDialog = signal<'export' | 'restore' | 'clear' | null>(null);
  protected readonly backupPassword = signal('');
  protected readonly confirmPassword = signal('');
  protected readonly clearPhrase = signal('');
  protected readonly restoreFile = signal<File | null>(null);
  protected readonly dataBusy = signal(false);
  protected readonly dataError = signal('');
  protected readonly dataNotice = signal('');
  protected readonly appVersion = environment.appVersion;
  protected readonly storageInfo = signal<{ usage: number; quota: number; persistent: boolean | null } | null>(null);
  protected readonly statementBytes = computed(() => this.statements.items().reduce((total, item) => total + item.size, 0));

  constructor() { void this.readStorageInfo(); }

  protected readonly focusLabel = computed(() => {
    switch (this.setup.profile()?.focus) {
      case 'spend-less': return 'Building better money habits';
      case 'history': return 'Keeping your money organised';
      default: return 'Understanding where your money goes';
    }
  });

  protected formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  }

  private async readStorageInfo() {
    if (!navigator.storage?.estimate) return;
    try {
      const estimate = await navigator.storage.estimate();
      const persistent = navigator.storage.persisted ? await navigator.storage.persisted() : null;
      this.storageInfo.set({ usage: estimate.usage ?? 0, quota: estimate.quota ?? 0, persistent });
    } catch { /* Some privacy modes hide storage estimates. The settings page still works without them. */ }
  }

  protected openDataDialog(dialog: 'export' | 'restore' | 'clear') {
    this.resetDialog();
    this.dataDialog.set(dialog);
  }

  protected chooseBackup(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    this.resetDialog();
    this.restoreFile.set(file);
    this.dataDialog.set('restore');
  }

  protected closeDataDialog() {
    if (!this.dataBusy()) this.resetDialog();
  }

  protected async createBackup(event: Event) {
    event.preventDefault();
    if (this.backupPassword() !== this.confirmPassword()) {
      this.dataError.set('The two passwords do not match.');
      return;
    }
    await this.runDataTask(async () => {
      await this.backup.download(this.backupPassword());
      this.resetDialog();
      this.dataNotice.set('Encrypted backup downloaded. Keep the file and password somewhere safe.');
    });
  }

  protected async restoreBackup(event: Event) {
    event.preventDefault();
    const file = this.restoreFile();
    if (!file) return;
    await this.runDataTask(async () => {
      await this.backup.restore(file, this.backupPassword());
      window.location.reload();
    });
  }

  protected async clearAllData() {
    if (this.clearPhrase() !== 'CLEAR') return;
    await this.runDataTask(async () => {
      await this.backup.clearAll();
      window.location.reload();
    });
  }

  private async runDataTask(task: () => Promise<void>) {
    if (this.dataBusy()) return;
    this.dataBusy.set(true);
    this.dataError.set('');
    try { await task(); }
    catch (error) { this.dataError.set(error instanceof Error ? error.message : 'Something went wrong. Please try again.'); }
    finally { this.dataBusy.set(false); }
  }

  private resetDialog() {
    this.dataDialog.set(null);
    this.backupPassword.set('');
    this.confirmPassword.set('');
    this.clearPhrase.set('');
    this.restoreFile.set(null);
    this.dataError.set('');
  }

  @HostListener('document:keydown.escape')
  protected onEscape() { this.closeDataDialog(); }
}
