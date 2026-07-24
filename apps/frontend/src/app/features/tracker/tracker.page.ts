import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import {
  Trophy,
  Banknote,
  ChartColumn,
  Hourglass,
  CircleOff,
  Wallet,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Activity,
  Medal,
  LucideAngularModule,
} from 'lucide-angular';
import type { EquityCurve, KpiSummary, TrackerAccount } from '@journal/shared-types';
import { ApiClient } from '../../core/http/api.client';
import { formatUsd } from '../../shared/format';

interface ChartPoint {
  readonly date: string;
  readonly capital: number;
  readonly ganancias: number;
  readonly gastos: number;
}

interface ChartTooltip {
  readonly x: number;
  readonly y: number;
  readonly date: string;
  readonly capital: number;
  readonly ganancias: number;
  readonly gastos: number;
}

const CAPITAL_COLOR = '#8b5cf6';
const PROFITS_COLOR = '#22c55e';
const EXPENSES_COLOR = '#ef4444';
const AREA_ALPHA = '33';

interface FirmAggregate {
  readonly company: string;
  readonly accountsCount: number;
  readonly totalExpenses: number;
  readonly totalProfits: number;
  readonly netProfit: number;
  readonly roi: number;
}

const GRID_LINES = 5;
const MONTH_DIVISOR = 7;
const POINT_RADIUS = 3;
const LABEL_OFFSET = 4;
const DATE_LABEL_OFFSET = 20;
const PADDING_X = 56;
const PADDING_Y = 28;
const PADDING_BOTTOM = 48;
const DPR = 2;
const TOP_ROWS = 3;
const PERCENT = 100;

@Component({
  selector: 'app-tracker-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './tracker.page.html',
  styleUrl: './tracker.page.scss',
})
export class TrackerPage implements OnInit, AfterViewInit {
  private readonly api = inject(ApiClient);
  private readonly chartCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('chartCanvas');

  protected readonly iconTrophy = Trophy;
  protected readonly iconWithdraw = Banknote;
  protected readonly iconEvaluations = ChartColumn;
  protected readonly iconLive = Hourglass;
  protected readonly iconFunding = CircleOff;
  protected readonly iconExpenses = Wallet;
  protected readonly iconProfits = DollarSign;
  protected readonly iconNet = TrendingUp;
  protected readonly iconBest = TrendingUp;
  protected readonly iconWorst = TrendingDown;
  protected readonly iconAvg = Activity;
  protected readonly iconRetiros = Medal;
  protected readonly formatUsd = formatUsd;

  protected readonly loading = signal<boolean>(true);
  protected readonly error = signal<string | null>(null);
  protected readonly dateFrom = signal<string>('');
  protected readonly dateTo = signal<string>('');

  private readonly accounts = signal<readonly TrackerAccount[]>([]);
  private readonly kpis = signal<KpiSummary | null>(null);
  private readonly equity = signal<EquityCurve | null>(null);

  protected readonly firms = computed<readonly FirmAggregate[]>(() =>
    this.aggregateByFirm(this.accounts()),
  );

  protected readonly topByRoi = computed<readonly FirmAggregate[]>(() =>
    [...this.firms()].sort((a, b) => b.roi - a.roi).slice(0, TOP_ROWS),
  );

  protected readonly topByWithdrawals = computed<readonly FirmAggregate[]>(() =>
    [...this.firms()].sort((a, b) => b.totalProfits - a.totalProfits).slice(0, TOP_ROWS),
  );

  protected readonly bestDay = computed<number>(() => Number(this.kpis()?.bestDayNet ?? 0));
  protected readonly worstDay = computed<number>(() => Number(this.kpis()?.worstDayNet ?? 0));

  protected readonly avgDay = computed<number>(() => {
    const points = this.equity()?.points ?? [];
    if (points.length === 0) {
      return 0;
    }
    const byDay = new Map<string, number>();
    for (const p of points) {
      const day = p.enteredAt.slice(0, 10);
      const trade = Number(p.tradeNet);
      byDay.set(day, (byDay.get(day) ?? 0) + trade);
    }
    if (byDay.size === 0) {
      return 0;
    }
    let total = 0;
    for (const v of byDay.values()) {
      total += v;
    }
    return total / byDay.size;
  });

  protected readonly withdrawalsTotal = computed<number>(() =>
    this.accounts().reduce((sum, a) => sum + a.totalProfits, 0),
  );

  protected readonly withdrawalsCount = computed<number>(
    () => this.accounts().filter(a => a.type === 'LIVE' && a.totalProfits > 0).length,
  );

  protected readonly evaluationsTotal = computed<number>(
    () => this.accounts().filter(a => a.type === 'EVALUATION').length,
  );

  protected readonly evaluationsActive = computed<number>(
    () => this.accounts().filter(a => a.type === 'EVALUATION' && a.status === 'ACTIVE').length,
  );

  protected readonly liveTotal = computed<number>(
    () => this.accounts().filter(a => a.type === 'LIVE').length,
  );

  protected readonly liveActive = computed<number>(
    () => this.accounts().filter(a => a.type === 'LIVE' && a.status === 'ACTIVE').length,
  );

  protected readonly fundingRatio = computed<number>(() => {
    const evals = this.evaluationsTotal();
    const live = this.liveTotal();
    const total = evals + live;
    return total > 0 ? (live / total) * PERCENT : 0;
  });

  protected readonly withdrawalRatio = computed<number>(() => {
    const live = this.accounts().filter(a => a.type === 'LIVE');
    if (live.length === 0) {
      return 0;
    }
    const withWithdrawals = live.filter(a => a.totalProfits > 0).length;
    return (withWithdrawals / live.length) * PERCENT;
  });

  protected readonly totalExpenses = computed<number>(() =>
    this.accounts().reduce((sum, a) => sum + a.totalExpenses, 0),
  );

  protected readonly avgExpensesPerAccount = computed<number>(() => {
    const list = this.accounts();
    return list.length > 0 ? this.totalExpenses() / list.length : 0;
  });

  protected readonly avgProfitsPerAccount = computed<number>(() => {
    const live = this.accounts().filter(a => a.type === 'LIVE');
    if (live.length === 0) {
      return 0;
    }
    const total = live.reduce((sum, a) => sum + a.totalProfits, 0);
    return total / live.length;
  });

  protected readonly netProfit = computed<number>(
    () => this.withdrawalsTotal() - this.totalExpenses(),
  );

  protected readonly globalRoi = computed<number>(() => {
    const expenses = this.totalExpenses();
    return expenses > 0 ? (this.withdrawalsTotal() / expenses) * PERCENT : 0;
  });

  ngOnInit(): void {
    void this.reload();
  }

  ngAfterViewInit(): void {
    this.drawChart();
  }

  protected async reload(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const filters = this.buildInsightsFilters();
      const [accounts, kpis, equity] = await Promise.all([
        this.api.get<TrackerAccount[]>('tracker-accounts'),
        this.api.get<KpiSummary>('insights/kpis', filters),
        this.api.get<EquityCurve>('insights/equity', filters),
      ]);
      this.accounts.set(accounts);
      this.kpis.set(kpis);
      this.equity.set(equity);
      queueMicrotask(() => this.drawChart());
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    } finally {
      this.loading.set(false);
    }
  }

  protected onDateFromChange(value: string): void {
    this.dateFrom.set(value);
    void this.reload();
  }

  protected onDateToChange(value: string): void {
    this.dateTo.set(value);
    void this.reload();
  }

  protected applyAll(): void {
    this.setRange('', '');
  }

  protected applyMtd(): void {
    const today = new Date();
    const from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
    this.setRange(from, this.toIsoDate(today));
  }

  protected applyYtd(): void {
    const today = new Date();
    this.setRange(`${today.getFullYear()}-01-01`, this.toIsoDate(today));
  }

  protected applyLast30(): void {
    const DAYS = 30;
    this.applyLastDays(DAYS);
  }

  protected applyLast90(): void {
    const DAYS = 90;
    this.applyLastDays(DAYS);
  }

  private applyLastDays(days: number): void {
    const today = new Date();
    const back = new Date(today);
    back.setDate(back.getDate() - days);
    this.setRange(this.toIsoDate(back), this.toIsoDate(today));
  }

  private setRange(from: string, to: string): void {
    this.dateFrom.set(from);
    this.dateTo.set(to);
    void this.reload();
  }

  private toIsoDate(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private buildInsightsFilters(): Record<string, string | undefined> {
    const from = this.dateFrom();
    const to = this.dateTo();
    return {
      from: from ? `${from}T00:00:00.000Z` : undefined,
      to: to ? `${to}T23:59:59.999Z` : undefined,
    };
  }

  protected roiClass(roi: number): string {
    if (roi > 0) {
      return 'pnl-positive';
    }
    if (roi < 0) {
      return 'pnl-negative';
    }
    return 'pnl-zero';
  }

  protected pnlClass(value: number): string {
    if (value > 0) {
      return 'pnl-positive';
    }
    if (value < 0) {
      return 'pnl-negative';
    }
    return 'pnl-zero';
  }

  protected formatPercent(value: number): string {
    if (!Number.isFinite(value)) {
      return '—';
    }
    return `${value.toFixed(1)} %`;
  }

  private aggregateByFirm(accounts: readonly TrackerAccount[]): readonly FirmAggregate[] {
    const map = new Map<string, FirmAggregate>();
    for (const a of accounts) {
      const prev = map.get(a.company);
      if (prev) {
        map.set(a.company, {
          company: a.company,
          accountsCount: prev.accountsCount + 1,
          totalExpenses: prev.totalExpenses + a.totalExpenses,
          totalProfits: prev.totalProfits + a.totalProfits,
          netProfit: prev.netProfit + a.netProfit,
          roi: 0,
        });
      } else {
        map.set(a.company, {
          company: a.company,
          accountsCount: 1,
          totalExpenses: a.totalExpenses,
          totalProfits: a.totalProfits,
          netProfit: a.netProfit,
          roi: 0,
        });
      }
    }
    return [...map.values()]
      .map<FirmAggregate>(f => ({
        ...f,
        roi: f.totalExpenses > 0 ? (f.totalProfits / f.totalExpenses) * PERCENT : 0,
      }))
      .sort((a, b) => a.company.localeCompare(b.company));
  }

  protected readonly chartData = computed<readonly ChartPoint[]>(() => {
    const points = this.equity()?.points ?? [];
    if (points.length === 0) {
      return [];
    }
    const byDay = new Map<string, { profits: number; expenses: number }>();
    for (const p of points) {
      const day = p.enteredAt.slice(0, 10);
      const net = Number(p.tradeNet);
      const bucket = byDay.get(day) ?? { profits: 0, expenses: 0 };
      if (net >= 0) {
        bucket.profits += net;
      } else {
        bucket.expenses += -net;
      }
      byDay.set(day, bucket);
    }
    const days = [...byDay.keys()].sort();
    let cumProfits = 0;
    let cumExpenses = 0;
    return days.map<ChartPoint>(day => {
      const b = byDay.get(day);
      const profits = b?.profits ?? 0;
      const expenses = b?.expenses ?? 0;
      cumProfits += profits;
      cumExpenses += expenses;
      return {
        date: day,
        capital: cumProfits - cumExpenses,
        ganancias: cumProfits,
        gastos: cumExpenses,
      };
    });
  });

  protected readonly tooltip = signal<ChartTooltip | null>(null);

  protected onChartMouseMove(event: MouseEvent): void {
    const data = this.chartData();
    if (data.length === 0) {
      return;
    }
    const canvas = this.chartCanvas().nativeElement;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const cssWidth = canvas.offsetWidth;
    const chartWidth = cssWidth - PADDING_X * 2;
    const lastIndex = data.length - 1 || 1;
    const relativeX = x - PADDING_X;
    if (relativeX < 0 || relativeX > chartWidth) {
      this.tooltip.set(null);
      return;
    }
    const index = Math.round((relativeX / chartWidth) * lastIndex);
    const point = data[Math.max(0, Math.min(lastIndex, index))];
    if (!point) {
      this.tooltip.set(null);
      return;
    }
    const snappedX = PADDING_X + (chartWidth / lastIndex) * index;
    this.tooltip.set({
      x: snappedX,
      y: event.clientY - rect.top,
      date: point.date,
      capital: point.capital,
      ganancias: point.ganancias,
      gastos: point.gastos,
    });
    this.drawChart();
  }

  protected onChartMouseLeave(): void {
    this.tooltip.set(null);
    this.drawChart();
  }

  protected formatTooltipDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00Z`);
    const day = d.getUTCDate();
    const monthNames = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    const month = monthNames[d.getUTCMonth()] ?? '';
    const year = d.getUTCFullYear() % 100;
    return `${day} ${month} ${year}`;
  }

  private drawChart(): void {
    const canvas = this.chartCanvas().nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    const cssWidth = canvas.offsetWidth;
    const cssHeight = canvas.offsetHeight;
    canvas.width = cssWidth * DPR;
    canvas.height = cssHeight * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    ctx.clearRect(0, 0, cssWidth, cssHeight);

    const data = this.chartData();
    if (data.length === 0) {
      this.drawEmpty(ctx, cssWidth, cssHeight);
      return;
    }

    const chartWidth = cssWidth - PADDING_X * 2;
    const chartHeight = cssHeight - PADDING_Y - PADDING_BOTTOM;

    const styles = getComputedStyle(canvas);
    const gridColor = styles.getPropertyValue('--qp-line').trim() || '#e6e1d7';
    const mutedColor = styles.getPropertyValue('--qp-mute-2').trim() || '#8a847a';

    const allValues: number[] = [];
    for (const d of data) {
      allValues.push(d.capital, d.ganancias, d.gastos);
    }
    const minValue = Math.min(0, ...allValues);
    const maxValue = Math.max(0, ...allValues);
    const valueRange = maxValue - minValue || 1;
    const lastIndex = data.length - 1 || 1;
    const dateStep = Math.max(1, Math.floor(data.length / MONTH_DIVISOR));

    this.drawGrid(ctx, chartWidth, chartHeight, gridColor);
    this.drawSeries(ctx, data, chartWidth, chartHeight, lastIndex, minValue, valueRange);
    this.drawAxisLabels(ctx, {
      chartWidth,
      chartHeight,
      dateStep,
      lastIndex,
      minValue,
      valueRange,
      color: mutedColor,
      data,
    });
    this.drawHoverIndicator(ctx, chartHeight, mutedColor);
  }

  private drawEmpty(ctx: CanvasRenderingContext2D, cssWidth: number, cssHeight: number): void {
    const styles = getComputedStyle(this.chartCanvas().nativeElement);
    const muted = styles.getPropertyValue('--qp-mute-2').trim() || '#8a847a';
    ctx.fillStyle = muted;
    ctx.font = '13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Sin trades registrados todavía', cssWidth / 2, cssHeight / 2);
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    chartWidth: number,
    chartHeight: number,
    color: string,
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= GRID_LINES; i++) {
      const y = PADDING_Y + (chartHeight / GRID_LINES) * i;
      ctx.beginPath();
      ctx.moveTo(PADDING_X, y);
      ctx.lineTo(PADDING_X + chartWidth, y);
      ctx.stroke();
    }
  }

  private valueToY(
    value: number,
    chartHeight: number,
    minValue: number,
    valueRange: number,
  ): number {
    return PADDING_Y + chartHeight - ((value - minValue) / valueRange) * chartHeight;
  }

  private drawSeries(
    ctx: CanvasRenderingContext2D,
    data: readonly ChartPoint[],
    chartWidth: number,
    chartHeight: number,
    lastIndex: number,
    minValue: number,
    valueRange: number,
  ): void {
    const baseY = this.valueToY(0, chartHeight, minValue, valueRange);
    const series: ReadonlyArray<{
      color: string;
      key: 'capital' | 'ganancias' | 'gastos';
    }> = [
      { color: EXPENSES_COLOR, key: 'gastos' },
      { color: PROFITS_COLOR, key: 'ganancias' },
      { color: CAPITAL_COLOR, key: 'capital' },
    ];
    for (const s of series) {
      this.drawSeriesPath(ctx, data, chartWidth, chartHeight, lastIndex, minValue, valueRange, baseY, s.color, s.key);
    }
  }

  private drawSeriesPath(
    ctx: CanvasRenderingContext2D,
    data: readonly ChartPoint[],
    chartWidth: number,
    chartHeight: number,
    lastIndex: number,
    minValue: number,
    valueRange: number,
    baseY: number,
    color: string,
    key: 'capital' | 'ganancias' | 'gastos',
  ): void {
    ctx.beginPath();
    data.forEach((point, index) => {
      const x = PADDING_X + (chartWidth / lastIndex) * index;
      const y = this.valueToY(point[key], chartHeight, minValue, valueRange);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    const lastX = PADDING_X + chartWidth;
    ctx.lineTo(lastX, baseY);
    ctx.lineTo(PADDING_X, baseY);
    ctx.closePath();
    ctx.fillStyle = `${color}${AREA_ALPHA}`;
    ctx.fill();

    ctx.beginPath();
    data.forEach((point, index) => {
      const x = PADDING_X + (chartWidth / lastIndex) * index;
      const y = this.valueToY(point[key], chartHeight, minValue, valueRange);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawAxisLabels(
    ctx: CanvasRenderingContext2D,
    args: {
      chartWidth: number;
      chartHeight: number;
      dateStep: number;
      lastIndex: number;
      minValue: number;
      valueRange: number;
      color: string;
      data: readonly ChartPoint[];
    },
  ): void {
    ctx.fillStyle = args.color;
    ctx.font = '11px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';

    for (let i = 0; i <= GRID_LINES; i++) {
      const value = args.minValue + (args.valueRange / GRID_LINES) * (GRID_LINES - i);
      const y = PADDING_Y + (args.chartHeight / GRID_LINES) * i + LABEL_OFFSET;
      ctx.fillText(this.formatAxisValue(value), PADDING_X - 10, y);
    }

    ctx.textAlign = 'center';
    for (let i = 0; i < args.data.length; i += args.dateStep) {
      const point = args.data[i];
      if (!point) {
        continue;
      }
      const x = PADDING_X + (args.chartWidth / args.lastIndex) * i;
      ctx.fillText(
        this.formatTooltipDate(point.date),
        x,
        PADDING_Y + args.chartHeight + DATE_LABEL_OFFSET,
      );
    }
  }

  private drawHoverIndicator(
    ctx: CanvasRenderingContext2D,
    chartHeight: number,
    color: string,
  ): void {
    const tip = this.tooltip();
    if (!tip) {
      return;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(tip.x, PADDING_Y);
    ctx.lineTo(tip.x, PADDING_Y + chartHeight);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private formatAxisValue(value: number): string {
    const THOUSAND = 1000;
    if (Math.abs(value) >= THOUSAND) {
      return `$${Math.round(value / THOUSAND)}k`;
    }
    return `$${Math.round(value)}`;
  }
}
