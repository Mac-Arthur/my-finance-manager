import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataBackup } from '../../services/backup/backup';
import { Theme } from '../../services/theme/theme';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({
  selector: 'app-restore',
  imports: [RouterLink, Icon],
  templateUrl: './restore.html',
  styleUrl: './restore.css',
})
export class Restore {
  protected readonly theme = inject(Theme);
  protected readonly backup = inject(DataBackup);
  protected readonly icons = ICONS;
  protected readonly file = signal<File | null>(null);
  protected readonly password = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');

  protected chooseFile(event: Event) {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
    this.error.set('');
  }

  protected async restore(event: Event) {
    event.preventDefault();
    const file = this.file();
    if (!file || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await this.backup.restore(file, this.password());
      window.location.replace('/home');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not restore this backup.');
      this.busy.set(false);
    }
  }
}
