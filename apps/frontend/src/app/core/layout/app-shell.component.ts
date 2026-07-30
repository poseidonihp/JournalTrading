import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Dialog } from '@angular/cdk/dialog';
import { LucideAngularModule, Sun, Moon, LogOut, Plus, Menu, X } from 'lucide-angular';

import { ThemeService } from '../theme/theme.service';
import { AuthStore } from '../auth/auth.store';
import { IdleTimeoutService } from '../auth/idle-timeout.service';
import { AccountsStore } from '../accounts/accounts.store';
import { AccountSelectorComponent } from './account-selector.component';
import { BrandMarkComponent } from '../../shared/ui/brand-mark.component';
import {
  TradeFormDialogComponent,
  type TradeFormDialogData,
} from '../../features/trades/trade-form-dialog.component';
import type { Trade } from '@journal/shared-types';

interface NavItem {
  label: string;
  route: string;
  disabled?: boolean;
}

@Component({
  selector: 'app-shell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    LucideAngularModule,
    AccountSelectorComponent,
    BrandMarkComponent,
    CdkMenuTrigger,
    CdkMenu,
    CdkMenuItem,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  protected readonly theme = inject(ThemeService);
  private readonly auth = inject(AuthStore);
  private readonly accountsStore = inject(AccountsStore);
  private readonly dialog = inject(Dialog);

  constructor() {
    inject(IdleTimeoutService).start(inject(DestroyRef));
  }

  protected readonly iconSun = Sun;
  protected readonly iconMoon = Moon;
  protected readonly iconLogout = LogOut;
  protected readonly iconPlus = Plus;
  protected readonly iconMenu = Menu;
  protected readonly iconClose = X;

  /** Estado del drawer lateral en viewports móviles (<768px). */
  protected readonly sidebarOpen = signal(false);

  protected toggleSidebar(): void {
    this.sidebarOpen.update((v) => !v);
  }

  protected closeSidebar(): void {
    this.sidebarOpen.set(false);
  }

  protected readonly user = this.auth.user;
  protected readonly accountLabel = computed(() => {
    const id = this.accountsStore.selectedId();
    if (id === 'ALL') {
      const n = this.accountsStore.accounts().length;
      return n === 0 ? 'Sin cuentas' : `Todas las cuentas · ${n}`;
    }
    const sel = this.accountsStore.selected();
    if (!sel) {
      return 'Sin cuenta';
    }
    return sel.broker ? `${sel.broker} · ${sel.currency}` : sel.currency;
  });
  protected readonly initial = computed(() => {
    const u = this.auth.user();
    if (!u) {
      return 'J';
    }
    return (u.displayName || u.email).charAt(0).toUpperCase();
  });

  protected readonly nav: readonly NavItem[] = [
    { label: 'Dashboard', route: '/dashboard' },
    { label: 'Trades', route: '/trades' },
    { label: 'Notebook', route: '/notebook' },
    { label: 'Capital', route: '/capital' },
    { label: 'Instrumentos', route: '/instruments' },
    { label: 'Tipos de trade', route: '/tipos-trade' },
    { label: 'Usuarios', route: '/users' },
    { label: 'Reports', route: '/reports' },
    { label: 'Tracker', route: '/tracker' },
    { label: 'Accounts', route: '/accounts' },
    { label: 'Playbooks', route: '/playbooks', disabled: true },
    { label: 'Trade Replay', route: '/replay', disabled: true },
    { label: 'Mentor Mode', route: '/mentor', disabled: true },
    { label: 'Resource Center', route: '/resources', disabled: true },
  ];

  async logout(): Promise<void> {
    await this.auth.logout();
    globalThis.location.href = '/login';
  }

  openNewTrade(): void {
    const data: TradeFormDialogData = {};
    this.dialog.open<Trade | null, TradeFormDialogData, TradeFormDialogComponent>(
      TradeFormDialogComponent,
      {
        data,
        hasBackdrop: true,
        backdropClass: ['bg-black/40'],
        panelClass: ['p-0'],
        autoFocus: 'first-tabbable',
        disableClose: true,
      },
    );
  }
}
