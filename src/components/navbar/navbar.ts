import { Component, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Onboarding } from '../../services/onboarding/onboarding';
import { Theme } from '../../services/theme/theme';
import { Finance } from '../../services/finance/finance';

interface NavTab {
  label: string;
  path: string;
  /** SVG path data (24x24, stroke icons). */
  icon: string;
}

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
  host: {
    // Close the mobile menu with Escape.
    '(document:keydown.escape)': 'mobileOpen.set(false)',
  },
})
export class Navbar {
  protected readonly theme = inject(Theme);
  protected readonly mobileOpen = signal(false);

  protected readonly setup = inject(Onboarding);
  protected readonly finance = inject(Finance);

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
      label: 'Budgets',
      path: '/budgets',
      icon: 'M3 7h18v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1zM3 7l2-3h14l2 3M16 13h2',
    },
    {
      label: 'Reports',
      path: '/reports',
      icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
    },
  ];
}
