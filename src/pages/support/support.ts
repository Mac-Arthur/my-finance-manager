import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '../../environments/environment';
import { Icon } from '../../shared/icon';
import { ICONS } from '../../shared/icons';

@Component({ selector: 'app-support', imports: [RouterLink, Icon], templateUrl: './support.html', styleUrl: './support.css' })
export class Support {
  protected readonly icons = ICONS;
  protected readonly version = environment.appVersion;
  protected readonly copied = signal(false);

  protected async copyDiagnostics() {
    const details = [`myAvailable ${this.version}`, `Browser: ${navigator.userAgent}`, `Secure connection: ${globalThis.isSecureContext ? 'yes' : 'no'}`, `Online: ${navigator.onLine ? 'yes' : 'no'}`].join('\n');
    try {
      await navigator.clipboard.writeText(details);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2500);
    } catch { this.copied.set(false); }
  }
}
