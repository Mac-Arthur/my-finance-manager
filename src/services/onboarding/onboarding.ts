import { Injectable, computed, signal } from '@angular/core';

export interface LocalProfile {
  name: string;
  focus: 'understand' | 'spend-less' | 'history';
  currency: 'GHS';
  createdAt: string;
}
const KEY = 'mysika.profile.v1';

/** Local setup only. This is not authentication or an access-control boundary. */
@Injectable({ providedIn: 'root' })
export class Onboarding {
  readonly profile = signal<LocalProfile | null>(this.read());
  readonly initials = computed(() => this.profile()?.name.split(/\s+/).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'M');

  complete(name: string, focus: LocalProfile['focus']) {
    const cleanName = name.trim();
    if (!cleanName || cleanName.length > 60) throw new Error('Enter a name between 1 and 60 characters.');
    if (!['understand', 'spend-less', 'history'].includes(focus)) throw new Error('Choose a focus.');
    const profile: LocalProfile = { name: cleanName, focus, currency: 'GHS', createdAt: this.profile()?.createdAt ?? new Date().toISOString() };
    try { localStorage.setItem(KEY, JSON.stringify(profile)); }
    catch { throw new Error('Your browser could not save your profile. Enable site storage and try again.'); }
    this.profile.set(profile);
  }

  private read(): LocalProfile | null {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) || 'null');
      return p && typeof p.name === 'string' && p.name.trim() && p.name.length <= 60 && p.currency === 'GHS'
        && ['understand', 'spend-less', 'history'].includes(p.focus) && typeof p.createdAt === 'string' ? p : null;
    } catch { return null; }
  }
}
