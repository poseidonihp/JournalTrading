import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Loader, TrendingDown } from 'lucide-angular';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { InsightsStore } from '../dashboard/insights.store';
import { KpiCardsComponent } from '../dashboard/kpi-cards.component';
import { ReportsStore } from './reports.store';
import { UnderwaterChartComponent } from './underwater-chart.component';
import { YearlyCurveComponent } from './yearly-curve.component';
import { MonthlyBarsComponent } from './monthly-bars.component';
import { TimePerfChartComponent } from './time-perf-chart.component';
import { formatUsd, pnlClass } from '../../shared/format';

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-reports-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, KpiCardsComponent, UnderwaterChartComponent, YearlyCurveComponent, MonthlyBarsComponent, TimePerfChartComponent],
  templateUrl: './reports.page.html',
  host: { class: 'block flex-1 min-h-0 overflow-y-auto' },
})
export class ReportsPage implements OnInit {
  protected readonly iconLoader = Loader;
  protected readonly iconDown = TrendingDown;
  protected readonly formatUsd = formatUsd;

  private readonly reports = inject(ReportsStore);
  private readonly insights = inject(InsightsStore);
  private readonly accounts = inject(AccountsStore);

  protected readonly month = signal<string>('');
  protected readonly granularity = signal<'trade' | 'day'>('trade');
  protected readonly year = signal<number>(new Date().getFullYear());
  protected readonly barsMetric = signal<'points' | 'net'>('points');
  protected readonly timeMode = signal<'hour' | 'weekday'>('hour');
  protected readonly monthNames = MONTH_NAMES;

  protected readonly report = this.reports.drawdown;
  protected readonly yearly = this.reports.yearly;
  protected readonly yearlyLoading = this.reports.yearlyLoading;
  protected readonly timePerf = this.reports.timePerf;
  protected readonly timePerfLoading = this.reports.timePerfLoading;
  protected readonly yearKpis = this.reports.yearKpis;
  protected readonly yearKpisLoading = this.reports.yearKpisLoading;
  protected readonly loading = this.reports.loading;
  protected readonly error = this.reports.error;

  protected readonly timeBuckets = computed(() => {
    const tp = this.timePerf();
    if (!tp) return [];
    return this.timeMode() === 'hour' ? tp.byHour : tp.byWeekday;
  });

  protected readonly timeBestLabel = computed(() => {
    const buckets = this.timeBuckets();
    let best: typeof buckets[number] | null = null;
    for (const b of buckets) {
      if (b.trades === 0) continue;
      if (!best || Number(b.net) > Number(best.net)) best = b;
    }
    if (!best) return '—';
    const label = this.timeMode() === 'hour' ? `${String(best.key).padStart(2, '0')}:00` : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][best.key];
    return `${label} · ${formatUsd(best.net)}`;
  });

  protected readonly timeWorstLabel = computed(() => {
    const buckets = this.timeBuckets();
    let worst: typeof buckets[number] | null = null;
    for (const b of buckets) {
      if (b.trades === 0) continue;
      if (!worst || Number(b.net) < Number(worst.net)) worst = b;
    }
    if (!worst) return '—';
    const label = this.timeMode() === 'hour' ? `${String(worst.key).padStart(2, '0')}:00` : ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][worst.key];
    return `${label} · ${formatUsd(worst.net)}`;
  });

  protected readonly availableYears = computed(() => {
    const months = this.insights.availableMonths();
    const years = new Set<number>();
    for (const m of months) {
      const y = Number(m.split('-')[0]);
      if (!Number.isNaN(y)) years.add(y);
    }
    years.add(new Date().getFullYear());
    years.add(this.year());
    return Array.from(years).sort((a, b) => b - a);
  });

  protected readonly yearMonths = computed(() => this.yearly()?.months ?? []);
  protected readonly yearTotals = computed(() => this.yearly()?.totals ?? null);

  protected readonly series = computed(() => {
    const r = this.report();
    if (!r) return null;
    return this.granularity() === 'trade' ? r.byTrade : r.byDay;
  });

  protected readonly maxDdLabel = computed(() => {
    const s = this.series();
    return s ? formatUsd(s.maxDrawdown) : '—';
  });

  protected readonly maxDdPctLabel = computed(() => {
    const s = this.series();
    if (!s || s.maxDrawdownPct === 0) return '—';
    return `${s.maxDrawdownPct.toFixed(2)}%`;
  });

  protected readonly maxDdDateLabel = computed(() => {
    const s = this.series();
    if (!s?.maxDrawdownAt) return '—';
    return ReportsPage.formatDate(s.maxDrawdownAt, this.granularity());
  });

  protected readonly currentDdLabel = computed(() => {
    const s = this.series();
    return s ? formatUsd(s.currentDrawdown) : '—';
  });

  protected readonly availableMonths = computed(() => {
    const fromBackend = this.insights.availableMonths();
    const set = new Set<string>(fromBackend);
    const cur = this.month() || currentMonth();
    set.add(cur);
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

  constructor() {
    effect(() => {
      this.accounts.selectedId();
      void this.reports.loadDrawdown(this.month() || undefined);
    });
    effect(() => {
      this.accounts.selectedId();
      void this.reports.loadYearly(this.year());
    });
    effect(() => {
      this.accounts.selectedId();
      void this.reports.loadTimePerf(this.year());
    });
    effect(() => {
      this.accounts.selectedId();
      void this.reports.loadYearKpis(this.year());
    });
  }

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    if (this.accounts.accounts().length === 0) {
      await this.accounts.load();
    }
    await Promise.all([
      this.insights.loadAvailableMonths(),
      this.reports.loadDrawdown(undefined),
    ]);
  }

  protected async onMonthChange(value: string): Promise<void> {
    this.month.set(value);
    await this.reports.loadDrawdown(value || undefined);
  }

  protected async onYearChange(value: number | string): Promise<void> {
    const y = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(y) || y === this.year()) return;
    this.year.set(y);
    await this.reports.loadYearly(y);
  }

  protected setGranularity(g: 'trade' | 'day'): void {
    this.granularity.set(g);
  }

  protected setBarsMetric(m: 'points' | 'net'): void {
    this.barsMetric.set(m);
  }

  protected setTimeMode(m: 'hour' | 'weekday'): void {
    this.timeMode.set(m);
  }

  protected pnlColor(value: string | number): string {
    const n = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(n) || n === 0) return 'var(--qp-mute-2)';
    return n > 0 ? 'var(--qp-sage)' : 'var(--qp-clay)';
  }

  protected formatPoints(value: string): string {
    const n = Number(value);
    if (Number.isNaN(n)) return '—';
    return n.toFixed(2);
  }

  protected formatPct(value: number): string {
    if (!value) return '—';
    return `${value.toFixed(0)}%`;
  }

  protected formatPf(value: number | null): string {
    if (value === null || value === 0) return '—';
    return value.toFixed(2);
  }

  protected cellTint(value: string | number, trades: number): string {
    if (trades === 0) return 'transparent';
    const n = typeof value === 'string' ? Number(value) : value;
    if (Number.isNaN(n) || n === 0) return 'transparent';
    return n > 0
      ? 'color-mix(in srgb, var(--qp-sage) 12%, transparent)'
      : 'color-mix(in srgb, var(--qp-clay) 14%, transparent)';
  }

  protected winRateBar(winRate: number): { width: string; color: string } {
    if (!winRate) return { width: '0%', color: 'var(--qp-mute-2)' };
    const w = Math.max(0, Math.min(100, winRate));
    const color = winRate >= 50 ? 'var(--qp-sage)' : 'var(--qp-clay)';
    return { width: `${w}%`, color };
  }

  protected pfBadgeStyle(pf: number | null): { bg: string; color: string } {
    if (pf === null || pf === 0) {
      return { bg: 'transparent', color: 'var(--qp-mute-2)' };
    }
    if (pf >= 1.5) {
      return { bg: 'color-mix(in srgb, var(--qp-sage) 18%, transparent)', color: 'var(--qp-sage)' };
    }
    if (pf >= 1) {
      return { bg: 'color-mix(in srgb, var(--qp-sage) 10%, transparent)', color: 'var(--qp-ink)' };
    }
    return { bg: 'color-mix(in srgb, var(--qp-clay) 14%, transparent)', color: 'var(--qp-clay)' };
  }

  protected get summary() {
    return this.report()?.summary ?? null;
  }

  private static formatDate(value: string, granularity: 'trade' | 'day'): string {
    if (granularity === 'day') {
      const [y, m, d] = value.split('-');
      if (!y || !m || !d) return value;
      return `${d}/${m}/${y}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  }
}
