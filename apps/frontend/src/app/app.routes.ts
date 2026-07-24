import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./core/layout/app-shell.component').then(m => m.AppShellComponent),
    children: [
      {
        path: 'tracker',
        loadComponent: () =>
          import('./features/tracker/tracker.page').then(m => m.TrackerPage),
      },
      {
        path: 'accounts',
        loadComponent: () =>
          import('./features/accounts/accounts.page').then(m => m.AccountsPage),
      },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.page').then(m => m.DashboardPage),
      },
      {
        path: 'trades',
        loadComponent: () =>
          import('./features/trades/trades.page').then(m => m.TradesPage),
      },
      {
        path: 'notebook',
        loadComponent: () =>
          import('./features/notebook/notebook.page').then(m => m.NotebookPage),
      },
      {
        path: 'capital',
        loadComponent: () =>
          import('./features/capital/capital.page').then(m => m.CapitalPage),
      },
      {
        path: 'instruments',
        loadComponent: () =>
          import('./features/instruments/instruments.page').then(m => m.InstrumentsPage),
      },
      {
        path: 'tipos-trade',
        loadComponent: () =>
          import('./features/trade-types/trade-types.page').then(m => m.TradeTypesPage),
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.page').then(m => m.ReportsPage),
      },
      {
        path: 'users',
        loadComponent: () =>
          import('./features/users/users.page').then(m => m.UsersPage),
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
    ],
  },
  { path: '**', redirectTo: '' },
];
