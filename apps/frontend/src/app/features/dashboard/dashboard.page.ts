import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LucideAngularModule, ChevronLeft, ChevronRight, Loader } from 'lucide-angular';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { InsightsStore } from './insights.store';
import { CalendarHeatmapComponent } from './calendar-heatmap.component';
import { DailyPnlChartsComponent } from './daily-pnl-charts.component';
import { EquityCurveComponent } from './equity-curve.component';
import { KpiCardsComponent } from './kpi-cards.component';
import {
  MonthPickerComponent,
  type IMonthSelection,
} from '../../shared/ui/month-picker.component';
import {
  currentMonthKey,
  monthKey,
  monthYearLabel,
  parseMonthKey,
  shiftMonthKey,
} from '../../shared/months';
import { formatUsd } from '../../shared/format';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    CalendarHeatmapComponent,
    DailyPnlChartsComponent,
    EquityCurveComponent,
    KpiCardsComponent,
    MonthPickerComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  protected readonly iconLeft = ChevronLeft;
  protected readonly iconRight = ChevronRight;
  protected readonly iconLoader = Loader;
  protected readonly formatUsd = formatUsd;

  private readonly insights = inject(InsightsStore);
  private readonly accounts = inject(AccountsStore);

  protected readonly month = signal<string>(currentMonthKey());

  /** Claves `YYYY-MM` ofrecidas: las que tienen datos más la selección vigente. */
  protected readonly monthKeys = computed(() => {
    const keys = new Set<string>(this.insights.availableMonths());
    keys.add(this.month());
    keys.add(currentMonthKey());
    return Array.from(keys);
  });

  protected readonly selectedYear = computed(
    () => parseMonthKey(this.month())?.year ?? new Date().getFullYear(),
  );
  protected readonly selectedMonth = computed(
    () => parseMonthKey(this.month())?.month ?? new Date().getMonth() + 1,
  );

  protected readonly kpis = this.insights.kpis;
  protected readonly equity = this.insights.equity;
  protected readonly calendar = this.insights.calendar;
  protected readonly loading = this.insights.loading;
  protected readonly error = this.insights.error;

  protected readonly monthLabel = computed(() => monthYearLabel(this.month()));

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    if (this.accounts.accounts().length === 0) {
      await this.accounts.load();
    }
    await Promise.all([
      this.insights.loadAll(this.month()),
      this.insights.loadAvailableMonths(),
    ]);
  }

  protected async prevMonth(): Promise<void> {
    await this.applyMonth(shiftMonthKey(this.month(), -1));
  }

  protected async nextMonth(): Promise<void> {
    await this.applyMonth(shiftMonthKey(this.month(), 1));
  }

  protected async reload(): Promise<void> {
    await this.insights.loadAll(this.month());
  }

  protected async onPeriodChange(selection: IMonthSelection): Promise<void> {
    if (selection.year === null || selection.month === null) {
      return;
    }
    await this.applyMonth(monthKey(selection.year, selection.month));
  }

  private async applyMonth(key: string): Promise<void> {
    if (key === this.month()) {
      return;
    }
    this.month.set(key);
    await this.insights.loadAll(key);
  }
}
