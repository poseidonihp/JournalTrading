import { Injectable, inject, signal } from '@angular/core';
import type {
  CalendarMonth,
  EquityCurve,
  KpiSummary,
} from '@journal/shared-types';
import { ApiClient } from '../../core/http/api.client';
import { AccountsStore } from '../../core/accounts/accounts.store';

export interface DashboardFilters {
  month?: string;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class InsightsStore {
  private readonly api = inject(ApiClient);
  private readonly accounts = inject(AccountsStore);

  private readonly _kpis = signal<KpiSummary | null>(null);
  private readonly _equity = signal<EquityCurve | null>(null);
  private readonly _calendar = signal<CalendarMonth | null>(null);
  private readonly _availableMonths = signal<string[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _filters = signal<DashboardFilters>({});

  readonly kpis = this._kpis.asReadonly();
  readonly equity = this._equity.asReadonly();
  readonly calendar = this._calendar.asReadonly();
  readonly availableMonths = this._availableMonths.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly filters = this._filters.asReadonly();

  async loadAvailableMonths(): Promise<void> {
    const accountId = this.activeAccountId();
    const list = await this.api.get<string[]>('insights/available-months', { accountId });
    this._availableMonths.set(list);
  }

  setMonth(month: string): void {
    this._filters.update(f => ({ ...f, month }));
  }

  setFilters(f: DashboardFilters): void {
    this._filters.set(f);
  }

  async loadAll(month: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const accountId = this.activeAccountId();
      const baseParams = { accountId, month };
      const [k, e, c] = await Promise.all([
        this.api.get<KpiSummary>('insights/kpis', baseParams),
        this.api.get<EquityCurve>('insights/equity', baseParams),
        this.api.get<CalendarMonth>('insights/calendar', { accountId, month }),
      ]);
      this._kpis.set(k);
      this._equity.set(e);
      this._calendar.set(c);
      this._filters.set({ month });
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
    } finally {
      this._loading.set(false);
    }
  }

  private activeAccountId(): string | undefined {
    const id = this.accounts.selectedId();
    return id && id !== 'ALL' ? id : undefined;
  }
}
