import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CalendarDay } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';

const WIDTH = 520;
const HEIGHT = 220;
const PADDING_TOP = 14;
const PADDING_BOTTOM = 26;
const PADDING_LEFT = 48;
const PADDING_RIGHT = 12;
const Y_TICKS = 5;
const MIN_BAR_WIDTH = 4;
const BAR_GAP_RATIO = 0.35;
const WEEKDAY_GAP_RATIO = 0.45;
const X_LABEL_TARGET = 4;
const DAYS_IN_WEEK = 7;
const MONDAY_SHIFT = 6;

const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

interface AxisTick {
  value: number;
  label: string;
  y: number;
}

interface XTick {
  label: string;
  x: number;
}

interface Bar {
  x: number;
  y: number;
  width: number;
  height: number;
  positive: boolean;
  net: number;
  label: string;
}

interface BarModel {
  isEmpty: boolean;
  bars: Bar[];
  zero: number;
  yTicks: AxisTick[];
  xTicks: XTick[];
}

function parseUtc(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatTick(value: number): string {
  if (value === 0) return '$0.00';
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1000) {
    return `${sign}$${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  }
  return `${sign}$${abs.toFixed(2)}`;
}

function formatShortDate(iso: string): string {
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return '';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function buildYTicks(min: number, max: number, scale: (v: number) => number): AxisTick[] {
  const range = max - min || 1;
  const rawStep = range / Y_TICKS;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const candidates = [1, 2, 2.5, 5, 10];
  const step =
    (candidates.find((c) => c * magnitude >= rawStep) ?? candidates[candidates.length - 1]!) *
    magnitude;
  const start = Math.floor(min / step) * step;
  const end = Math.ceil(max / step) * step;
  const ticks: AxisTick[] = [];
  for (let v = start; v <= end + step / 2; v += step) {
    const rounded = Math.abs(v) < step / 1000 ? 0 : v;
    ticks.push({ value: rounded, label: formatTick(rounded), y: scale(rounded) });
  }
  return ticks;
}

function buildDateXTicks(items: { date: string }[], xAt: (i: number) => number): XTick[] {
  if (items.length === 0) return [];
  const desired = Math.min(X_LABEL_TARGET, items.length);
  const ticks: XTick[] = [];
  const seen = new Set<number>();
  for (let k = 0; k < desired; k++) {
    const idx =
      desired === 1 ? 0 : Math.round((k * (items.length - 1)) / (desired - 1));
    if (seen.has(idx)) continue;
    seen.add(idx);
    const item = items[idx];
    if (!item) continue;
    ticks.push({ label: formatShortDate(item.date), x: xAt(idx) });
  }
  return ticks;
}

function buildBarModel(
  entries: { net: number; label: string }[],
  gapRatio: number,
  xTickFor: (xAt: (i: number) => number) => XTick[],
): BarModel {
  if (entries.length === 0) {
    return { isEmpty: true, bars: [], zero: HEIGHT / 2, yTicks: [], xTicks: [] };
  }
  const values = entries.map(e => e.net);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const usableH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
  const usableW = WIDTH - PADDING_LEFT - PADDING_RIGHT;
  const range = max - min || 1;
  const scaleY = (v: number): number =>
    HEIGHT - PADDING_BOTTOM - ((v - min) / range) * usableH;
  const slot = usableW / entries.length;
  const barWidth = Math.max(MIN_BAR_WIDTH, slot * (1 - gapRatio));
  const zero = scaleY(0);
  const xAt = (i: number): number => PADDING_LEFT + slot * (i + 0.5);
  const bars: Bar[] = entries.map((e, i) => {
    const yPos = scaleY(e.net);
    const top = Math.min(yPos, zero);
    const h = Math.max(1, Math.abs(yPos - zero));
    return {
      x: xAt(i) - barWidth / 2,
      y: top,
      width: barWidth,
      height: h,
      positive: e.net >= 0,
      net: e.net,
      label: e.label,
    };
  });
  return {
    bars,
    zero,
    isEmpty: false,
    yTicks: buildYTicks(min, max, scaleY),
    xTicks: xTickFor(xAt),
  };
}

@Component({
  selector: 'app-daily-pnl-charts',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <section class="card-panel p-5">
      <div class="flex items-center gap-2 mb-3">
        <h2 class="serif text-[16px]">P&L por día de la semana</h2>
      </div>
      @if (weekday().isEmpty) {
        <div class="py-12 text-center text-sm" style="color: var(--qp-mute-2);">
          Sin trades en el rango seleccionado.
        </div>
      } @else {
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="none"
          class="w-full"
          [style.height.px]="height"
        >
          @for (t of weekday().yTicks; track t.value) {
            <line
              [attr.x1]="padLeft"
              [attr.y1]="t.y"
              [attr.x2]="width - padRight"
              [attr.y2]="t.y"
              stroke="var(--qp-line)"
              stroke-opacity="0.5"
            />
            <text
              [attr.x]="padLeft - 6"
              [attr.y]="t.y + 3"
              text-anchor="end"
              font-size="10"
              fill="var(--qp-mute-2)"
            >{{ t.label }}</text>
          }

          <line
            [attr.x1]="padLeft"
            [attr.y1]="weekday().zero"
            [attr.x2]="width - padRight"
            [attr.y2]="weekday().zero"
            stroke="var(--qp-line-strong)"
            stroke-dasharray="3 3"
          />

          @for (b of weekday().bars; track b.label) {
            <rect
              [attr.x]="b.x"
              [attr.y]="b.y"
              [attr.width]="b.width"
              [attr.height]="b.height"
              [attr.fill]="b.positive ? 'var(--qp-sage)' : 'var(--qp-clay)'"
              rx="2"
            >
              <title>{{ b.label }} · {{ fmt(b.net) }}</title>
            </rect>
          }

          @for (t of weekday().xTicks; track t.label) {
            <text
              [attr.x]="t.x"
              [attr.y]="height - 8"
              text-anchor="middle"
              font-size="10"
              fill="var(--qp-mute-2)"
            >{{ t.label }}</text>
          }
        </svg>
      }
    </section>

    <section class="card-panel p-5">
      <div class="flex items-center gap-2 mb-3">
        <h2 class="serif text-[16px]">Net daily P&L</h2>
      </div>
      @if (bars().isEmpty) {
        <div class="py-12 text-center text-sm" style="color: var(--qp-mute-2);">
          Sin trades en el rango seleccionado.
        </div>
      } @else {
        <svg
          [attr.viewBox]="'0 0 ' + width + ' ' + height"
          preserveAspectRatio="none"
          class="w-full"
          [style.height.px]="height"
        >
          @for (t of bars().yTicks; track t.value) {
            <line
              [attr.x1]="padLeft"
              [attr.y1]="t.y"
              [attr.x2]="width - padRight"
              [attr.y2]="t.y"
              stroke="var(--qp-line)"
              stroke-opacity="0.5"
            />
            <text
              [attr.x]="padLeft - 6"
              [attr.y]="t.y + 3"
              text-anchor="end"
              font-size="10"
              fill="var(--qp-mute-2)"
            >{{ t.label }}</text>
          }

          <line
            [attr.x1]="padLeft"
            [attr.y1]="bars().zero"
            [attr.x2]="width - padRight"
            [attr.y2]="bars().zero"
            stroke="var(--qp-line-strong)"
            stroke-dasharray="3 3"
          />

          @for (b of bars().bars; track b.label) {
            <rect
              [attr.x]="b.x"
              [attr.y]="b.y"
              [attr.width]="b.width"
              [attr.height]="b.height"
              [attr.fill]="b.positive ? 'var(--qp-sage)' : 'var(--qp-clay)'"
              rx="2"
            >
              <title>{{ b.label }} · {{ fmt(b.net) }}</title>
            </rect>
          }

          @for (t of bars().xTicks; track t.label) {
            <text
              [attr.x]="t.x"
              [attr.y]="height - 8"
              text-anchor="middle"
              font-size="10"
              fill="var(--qp-mute-2)"
            >{{ t.label }}</text>
          }
        </svg>
      }
    </section>
  `,
})
export class DailyPnlChartsComponent {
  readonly days = input.required<CalendarDay[]>();

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;
  protected readonly padLeft = PADDING_LEFT;
  protected readonly padRight = PADDING_RIGHT;

  private readonly tradingDays = computed<CalendarDay[]>(() =>
    this.days()
      .filter((d) => d.tradesCount > 0)
      .sort((a, b) => a.date.localeCompare(b.date)),
  );

  protected readonly weekday = computed<BarModel>(() => {
    const items = this.tradingDays();
    if (items.length === 0) {
      return { isEmpty: true, bars: [], zero: HEIGHT / 2, yTicks: [], xTicks: [] };
    }
    const totals = Array.from({ length: DAYS_IN_WEEK }, () => 0);
    for (const d of items) {
      const date = parseUtc(d.date);
      if (!Number.isNaN(date.getTime())) {
        const idx = (date.getUTCDay() + MONDAY_SHIFT) % DAYS_IN_WEEK;
        totals[idx] = (totals[idx] ?? 0) + Number(d.net);
      }
    }
    const entries = WEEKDAY_LABELS.map((label, i) => ({
      label,
      net: totals[i] ?? 0,
    }));
    return buildBarModel(entries, WEEKDAY_GAP_RATIO, xAt =>
      entries.map((e, i) => ({ label: e.label, x: xAt(i) })),
    );
  });

  protected readonly bars = computed<BarModel>(() => {
    const items = this.tradingDays();
    const entries = items.map(d => ({ label: d.date, net: Number(d.net) }));
    return buildBarModel(entries, BAR_GAP_RATIO, xAt =>
      buildDateXTicks(items, xAt),
    );
  });

  protected fmt(v: number): string {
    return formatUsd(v);
  }
}
