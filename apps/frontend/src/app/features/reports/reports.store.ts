import { Injectable, inject, signal } from '@angular/core';
import type { DrawdownReport, TimePerformanceReport, YearlyReport } from '@journal/shared-types';
import { ApiClient } from '../../core/http/api.client';
import { AccountsStore } from '../../core/accounts/accounts.store';

@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly api = inject(ApiClient);
  private readonly accounts = inject(AccountsStore);

  private readonly _drawdown = signal<DrawdownReport | null>(null);
  private readonly _yearly = signal<YearlyReport | null>(null);
  private readonly _timePerf = signal<TimePerformanceReport | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _yearlyLoading = signal<boolean>(false);
  private readonly _timePerfLoading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly drawdown = this._drawdown.asReadonly();
  readonly yearly = this._yearly.asReadonly();
  readonly timePerf = this._timePerf.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly yearlyLoading = this._yearlyLoading.asReadonly();
  readonly timePerfLoading = this._timePerfLoading.asReadonly();
  readonly error = this._error.asReadonly();

  async loadDrawdown(month?: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const accountId = this.activeAccountId();
      const params: Record<string, string | undefined> = { accountId };
      if (month) params['month'] = month;
      const report = await this.api.get<DrawdownReport>('insights/drawdown', params);
      this._drawdown.set(report);
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
    } finally {
      this._loading.set(false);
    }
  }

  async loadYearly(year: number): Promise<void> {
    this._yearlyLoading.set(true);
    this._error.set(null);
    try {
      const accountId = this.activeAccountId();
      const report = await this.api.get<YearlyReport>('insights/yearly', { accountId, year });
      this._yearly.set(report);
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
    } finally {
      this._yearlyLoading.set(false);
    }
  }

  async loadTimePerf(year?: number): Promise<void> {
    this._timePerfLoading.set(true);
    this._error.set(null);
    try {
      const accountId = this.activeAccountId();
      const params: Record<string, string | number | undefined> = { accountId };
      if (year !== undefined) params['year'] = year;
      const report = await this.api.get<TimePerformanceReport>('insights/time-performance', params);
      this._timePerf.set(report);
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
    } finally {
      this._timePerfLoading.set(false);
    }
  }

  private activeAccountId(): string | undefined {
    const id = this.accounts.selectedId();
    return id && id !== 'ALL' ? id : undefined;
  }
}
