import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Onboarding } from '../../services/onboarding/onboarding';
import { Theme } from '../../services/theme/theme';
import { Finance } from '../../services/finance/finance';
import { DatePipe } from '@angular/common';
import { MoneyPipe } from '../../shared/money';

interface NavTab {
  label: string;
  path: string;
  /** SVG path data (24x24, stroke icons). */
  icon: string;
}

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, DatePipe, MoneyPipe],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  host: {
    '(document:keydown.escape)': 'closeOverlays()',
    '(document:click)': 'profileOpen.set(false)',
  },
})
export class Navbar {
  protected readonly theme = inject(Theme);
  protected readonly mobileOpen = signal(false);
  protected readonly profileOpen = signal(false);
  protected readonly transferReviewOpen = signal(false);

  protected readonly setup = inject(Onboarding);
  protected readonly finance = inject(Finance);

  protected openTransferReview() {
    this.mobileOpen.set(false);
    this.profileOpen.set(false);
    this.transferReviewOpen.set(true);
  }

  protected toggleProfile() {
    this.mobileOpen.set(false);
    this.profileOpen.update(open => !open);
  }

  protected selectAccount(key: string) {
    this.finance.selectAccount(key);
    this.profileOpen.set(false);
  }

  protected closeOverlays() {
    this.mobileOpen.set(false);
    this.profileOpen.set(false);
    this.transferReviewOpen.set(false);
  }

  protected readonly tabs: NavTab[] = [
    { label: 'Statements', path: '/statements', icon: 'M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4' },
    {
      label: 'Home',
      path: '/home',
      icon: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
    },
    {
      label: 'Transactions',
      path: '/transactions',
      icon: 'M7 7h13l-3-3M17 17H4l3 3',
    },
    {
      label: 'Outlook',
      path: '/outlook',
      icon: 'M3 17 9 11l4 4 8-9M16 6h5v5',
    },
    {
      label: 'Review',
      path: '/reports',
      icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    },
  ];
}
