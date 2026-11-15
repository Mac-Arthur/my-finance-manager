import { Routes } from '@angular/router';
import { Layout } from '../components/layout/layout';
import { setupGuard, welcomeGuard } from '../services/onboarding/onboarding.guard';
import { NotFound } from '../components/not-found/not-found';

export const routes: Routes = [
  { path: 'help', title: 'Help & supported statements · myAvailable', loadComponent: () => import('../pages/support/support').then(m => m.Support) },
  { path: 'privacy', title: 'Privacy · myAvailable', data: { document: 'privacy' }, loadComponent: () => import('../pages/legal/legal').then(m => m.Legal) },
  { path: 'terms', title: 'Terms · myAvailable', data: { document: 'terms' }, loadComponent: () => import('../pages/legal/legal').then(m => m.Legal) },
  { path: 'restore', title: 'Restore backup · myAvailable', loadComponent: () => import('../pages/restore/restore').then(m => m.Restore) },
  { path: 'welcome', title: 'Welcome · myAvailable', canActivate: [welcomeGuard], loadComponent: () => import('../pages/welcome/welcome').then(m => m.Welcome) },
  { path: 'onboarding', title: 'Your space · myAvailable', loadComponent: () => import('../pages/onboarding/onboarding').then(m => m.Onboarding) },
  {
    path: '',
    component: Layout,
    canActivateChild: [setupGuard],
    children: [
      { path: 'statements', title: 'Statements · myAvailable', loadComponent: () => import('../pages/statements/statements').then(m => m.Statements) },
      // Redirect lives inside the layout's children so '' always resolves under Layout.
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'home',
        title: 'Home · myAvailable',
        loadComponent: () => import('../pages/home/home').then((m) => m.Home),
      },
      {
        path: 'transactions',
        title: 'Transactions · myAvailable',
        loadComponent: () =>
          import('../pages/transactions/transactions').then((m) => m.Transactions),
      },
      {
        path: 'budgets',
        title: 'Budgets · myAvailable',
        loadComponent: () => import('../pages/budgets/budgets').then((m) => m.Budgets),
      },
      {
        path: 'reports',
        title: 'Reports · myAvailable',
        loadComponent: () => import('../pages/reports/reports').then((m) => m.Reports),
      },
      {
        path: 'notifications',
        title: 'Notifications · myAvailable',
        loadComponent: () =>
          import('../pages/notifications/notifications').then((m) => m.Notifications),
      },
      {
        path: 'profile',
        redirectTo: 'settings',
        pathMatch: 'full',
      },
      {
        path: 'settings',
        title: 'Your space · myAvailable',
        loadComponent: () => import('../pages/settings/settings').then((m) => m.Settings),
      },
    ],
  },
  { path: '**', component: NotFound },
];
