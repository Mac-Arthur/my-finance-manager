import { Component, HostListener, inject, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Theme } from '../services/theme/theme';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  // Injected at the root so the theme is applied on every route, including 404.
  // This is also the only place where we can listen to online/offline events.
  private readonly theme = inject(Theme);
  private readonly router = inject(Router);
  private readonly updates = inject(SwUpdate, { optional: true });
  protected readonly updateReady = signal(false);
  protected readonly recoveryRequired = signal(false);
  protected readonly online = signal(navigator.onLine);

  constructor() {
    this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd), takeUntilDestroyed())
      .subscribe(() => window.scrollTo(0, 0));

    if (this.updates?.isEnabled) {
      this.updates.versionUpdates
        .pipe(filter((event): event is VersionReadyEvent => event.type === 'VERSION_READY'), takeUntilDestroyed())
        .subscribe(() => this.updateReady.set(true));
      this.updates.unrecoverable
        .pipe(takeUntilDestroyed())
        .subscribe(() => this.recoveryRequired.set(true));
    }
  }

  @HostListener('window:online') protected onOnline() { this.online.set(true); }
  @HostListener('window:offline') protected onOffline() { this.online.set(false); }
  protected reloadForUpdate() { location.reload(); }
}
