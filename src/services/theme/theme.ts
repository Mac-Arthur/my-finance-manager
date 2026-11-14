import { Injectable, effect, signal } from '@angular/core';

export type ThemeName = 'finance' | 'finance-dark';

const STORAGE_KEY = 'theme';

@Injectable({ providedIn: 'root' })
export class Theme {
  /** Current theme. Read it in templates as `theme.current()`. */
  readonly current = signal<ThemeName>(this.initialTheme());

  constructor() {
    // Runs whenever `current` changes: applies the theme and remembers it.
    effect(() => {
      const theme = this.current();
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* Theme still works without persistence. */ }
    });
  }

  isDark(): boolean {
    return this.current() === 'finance-dark';
  }

  set(theme: ThemeName): void {
    this.current.set(theme);
  }

  toggle(): void {
    this.current.update((t) => (t === 'finance' ? 'finance-dark' : 'finance'));
  }

  private initialTheme(): ThemeName {
    let saved: string | null = null;
    try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* Fall back to the system theme. */ }
    if (saved === 'finance' || saved === 'finance-dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'finance-dark' : 'finance';
  }
}
