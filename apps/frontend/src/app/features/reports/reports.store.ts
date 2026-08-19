import { Injectable, inject, signal } from '@angular/core';
import type {
  DrawdownReport,
  KpiSummary,
  TimePerformanceReport,
  YearlyReport,
} from '@journal/shared-types';
import { ApiClient } from '../../core/http/api.client';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { yearRange } from '../../shared/months';

/** Rango de la consulta de drawdown: un mes, un año completo, o todo el histórico. */
export interface IDrawdownRange {
  month?: string;
  from?: string;
  to?: string;
}

@Injectable({ providedIn: 'root' })
export class ReportsStore {
  private readonly api = inject(ApiClient);
  private readonly accounts = inject(AccountsStore);

  private readonly _drawdown = signal<DrawdownReport | null>(null);
  private readonly _yearly = signal<YearlyReport | null>(null);
  private readonly _timePerf = signal<TimePerformanceReport | null>(null);
  private readonly _yearKpis = signal<KpiSummary | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _yearlyLoading = signal<boolean>(false);
  private readonly _timePerfLoading = signal<boolean>(false);
  private readonly _yearKpisLoading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  readonly drawdown = this._drawdown.asReadonly();
  readonly yearly = this._yearly.asReadonly();
  readonly timePerf = this._timePerf.asReadonly();
  readonly yearKpis = this._yearKpis.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly yearlyLoading = this._yearlyLoading.asReadonly();
  readonly timePerfLoading = this._timePerfLoading.asReadonly();
  readonly yearKpisLoading = this._yearKpisLoading.asReadonly();
  readonly error = this._error.asReadonly();

  async loadDrawdown(range: IDrawdownRange = {}): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const accountId = this.activeAccountId();
      const params: Record<string, string | undefined> = { accountId, ...range };
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

  /** Mismos KPIs del dashboard pero con el rango completo del año seleccionado. */
  async loadYearKpis(year: number): Promise<void> {
    this._yearKpisLoading.set(true);
    this._error.set(null);
    try {
      const accountId = this.activeAccountId();
      const summary = await this.api.get<KpiSummary>('insights/kpis', {
        accountId,
        ...yearRange(year),
      });
      this._yearKpis.set(summary);
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
    } finally {
      this._yearKpisLoading.set(false);
    }
  }

  async loadTimePerf(year?: number): Promise<void> {
    this._timePerfLoading.set(true);
    this._error.set(null);
    try {
      const accountId = this.activeAccountId();
      const params: Record<string, string | number | undefined> = { accountId };
      if (year !== undefined) {
        params['year'] = year;
      }
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
