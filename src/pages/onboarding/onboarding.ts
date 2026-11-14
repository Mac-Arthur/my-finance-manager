import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Onboarding as Setup, LocalProfile } from '../../services/onboarding/onboarding';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({ selector: 'app-onboarding', imports: [FormsModule, RouterLink, Icon], templateUrl: './onboarding.html', styleUrl: './onboarding.css' })
export class Onboarding {
  protected readonly setup = inject(Setup);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected name = this.setup.profile()?.name ?? '';
  protected focus: LocalProfile['focus'] = this.setup.profile()?.focus ?? 'understand';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly icons = ICONS;
  protected readonly choices = [
    { value: 'understand' as const, title: 'Understand my spending', detail: 'See where my money goes.', icon: ICONS.pie },
    { value: 'spend-less' as const, title: 'Build better habits', detail: 'Notice patterns and make small changes.', icon: ICONS.goal },
    { value: 'history' as const, title: 'Keep my money organised', detail: 'Bring my statements into one place.', icon: ICONS.history },
  ];

  async submit() {
    if (this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      this.setup.complete(this.name, this.focus);
      await this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnTo') === 'settings' ? '/settings' : '/statements');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'Could not save your setup. Please try again.');
    } finally { this.busy.set(false); }
  }
}
