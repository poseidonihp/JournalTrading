import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ChevronLeft, ChevronRight, Loader } from 'lucide-angular';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { InsightsStore } from './insights.store';
import { CalendarHeatmapComponent } from './calendar-heatmap.component';
import { DailyPnlChartsComponent } from './daily-pnl-charts.component';
import { EquityCurveComponent } from './equity-curve.component';
import {
  MiniDivergeComponent,
  MiniDonutComponent,
  MiniGaugeComponent,
} from './stats-charts.component';
import { formatUsd } from '../../shared/format';


function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    LucideAngularModule,
    CalendarHeatmapComponent,
    DailyPnlChartsComponent,
    EquityCurveComponent,
    MiniDonutComponent,
    MiniDivergeComponent,
    MiniGaugeComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  protected readonly iconLeft = ChevronLeft;
  protected readonly iconRight = ChevronRight;
  protected readonly iconLoader = Loader;
  protected readonly formatUsd = formatUsd;
  protected readonly Number = Number;

  private readonly insights = inject(InsightsStore);
  private readonly accounts = inject(AccountsStore);

  protected readonly month = signal<string>(currentMonth());
  protected readonly availableMonths = computed(() => {
    const fromBackend = this.insights.availableMonths();
    const set = new Set<string>(fromBackend);
    set.add(this.month());
    set.add(currentMonth());
    const sorted = Array.from(set).sort((a, b) => b.localeCompare(a));
    return sorted.map(value => {
      const [y, m] = value.split('-').map(Number);
      const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CO', {
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC',
      });
      return { value, label };
    });
  });
  protected readonly kpis = this.insights.kpis;
  protected readonly equity = this.insights.equity;
  protected readonly calendar = this.insights.calendar;
  protected readonly loading = this.insights.loading;
  protected readonly error = this.insights.error;

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
  });

  protected readonly profitFactorLabel = computed(() => {
    const pf = this.kpis()?.profitFactor;
    if (pf === null || pf === undefined) return '∞';
    return pf.toFixed(2);
  });

  protected readonly winRateLabel = computed(() => {
    const k = this.kpis();
    if (!k) return '—';
    return `${k.winRate.toFixed(1)}%`;
  });

  protected readonly avgDurationLabel = computed(() => {
    const k = this.kpis();
    if (!k || k.avgDurationSeconds === 0) return '—';
    const m = Math.floor(k.avgDurationSeconds / 60);
    const s = k.avgDurationSeconds % 60;
    if (m >= 60) {
      const h = Math.floor(m / 60);
      return `${h}h ${m % 60}m`;
    }
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  });

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
    this.month.update(m => shiftMonth(m, -1));
    await this.insights.loadAll(this.month());
  }

  protected async nextMonth(): Promise<void> {
    this.month.update(m => shiftMonth(m, 1));
    await this.insights.loadAll(this.month());
  }

  protected async reload(): Promise<void> {
    await this.insights.loadAll(this.month());
  }

  protected async onMonthChange(value: string): Promise<void> {
    if (!value || value === this.month()) return;
    this.month.set(value);
    await this.insights.loadAll(value);
  }
}
