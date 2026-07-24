import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TimeBucket } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';

const WIDTH = 1100;
const HEIGHT = 320;
const PADDING_LEFT = 64;
const PADDING_RIGHT = 24;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 60;
const GRID_STEPS = 4;
const BAR_GAP_RATIO = 0.25;
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

interface BarModel {
  x: number;
  y: number;
  height: number;
  width: number;
  positive: boolean;
  value: number;
  valueLabel: string;
  trades: number;
  xLabel: string;
  centerX: number;
  labelY: number;
  showLabel: boolean;
  labelText: string;
}

interface GridLine { y: number; label: string }

interface RenderModel {
  isEmpty: boolean;
  zeroY: number;
  bars: BarModel[];
  gridLines: GridLine[];
  clipId: string;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${counter}`;
}

@Component({
  selector: 'app-time-perf-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (model().isEmpty) {
      <div class="py-16 text-center text-sm" style="color: var(--qp-mute-2);">
        Sin trades en el rango seleccionado.
      </div>
    } @else {
      <svg viewBox="0 0 1100 320" preserveAspectRatio="none" class="w-full h-[320px]">
        @for (g of model().gridLines; track g.y) {
          <line x1="64" [attr.y1]="g.y" x2="1076" [attr.y2]="g.y"
            stroke="var(--qp-line)" stroke-opacity="0.45" stroke-dasharray="2 5"
            vector-effect="non-scaling-stroke" />
          <text x="58" [attr.y]="g.y + 3" font-size="10" text-anchor="end" fill="var(--qp-mute-2)">
            {{ g.label }}
          </text>
        }

        <line x1="64" [attr.y1]="model().zeroY" x2="1076" [attr.y2]="model().zeroY"
          stroke="var(--qp-line-strong)" stroke-width="1.25" vector-effect="non-scaling-stroke" />
        <text x="58" [attr.y]="model().zeroY + 3" font-size="10" text-anchor="end"
          font-weight="600" fill="var(--qp-mute-2)">$0</text>

        @for (b of model().bars; track b.x) {
          @if (b.trades > 0) {
            <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.width" [attr.height]="b.height"
              [attr.fill]="b.positive ? 'var(--qp-sage)' : 'var(--qp-clay)'"
              fill-opacity="0.85" rx="2" />
            @if (b.showLabel) {
              <text [attr.x]="b.centerX" [attr.y]="b.labelY"
                font-size="9" text-anchor="middle" font-weight="600"
                [attr.fill]="b.positive ? 'var(--qp-sage)' : 'var(--qp-clay)'">
                {{ b.labelText }}
              </text>
            }
          }
          <text [attr.x]="b.centerX" y="290"
            font-size="9" text-anchor="middle" fill="var(--qp-mute-2)"
            [attr.transform]="'rotate(-45 ' + b.centerX + ' 290)'">{{ b.xLabel }}</text>
          @if (b.trades > 0) {
            <text [attr.x]="b.centerX" y="308"
              font-size="8" text-anchor="middle" fill="var(--qp-mute-2)"
              [attr.transform]="'rotate(-45 ' + b.centerX + ' 308)'">{{ b.trades }}t</text>
          }
        }
      </svg>
    }
  `,
})
export class TimePerfChartComponent {
  readonly buckets = input.required<TimeBucket[]>();
  readonly mode = input<'hour' | 'weekday'>('hour');

  private readonly clipId = nextId();

  protected readonly model = computed<RenderModel>(() => {
    const buckets = this.buckets();
    const mode = this.mode();
    const labels = mode === 'hour' ? HOUR_LABELS : WEEKDAY_LABELS;
    if (buckets.length === 0 || buckets.every(b => b.trades === 0)) {
      return { isEmpty: true, zeroY: PADDING_TOP, bars: [], gridLines: [], clipId: this.clipId };
    }
    const values = buckets.map(b => Number(b.net));
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(0, ...values);
    const niceMin = TimePerfChartComponent.niceFloor(rawMin);
    const niceMax = TimePerfChartComponent.niceCeil(rawMax);
    const range = niceMax - niceMin || 1;
    const usableH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const usableW = WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const scaleY = (v: number): number => PADDING_TOP + ((niceMax - v) / range) * usableH;
    const zeroY = scaleY(0);
    const slotW = usableW / buckets.length;
    const barW = slotW * (1 - BAR_GAP_RATIO);
    const gridLines: GridLine[] = [];
    for (let i = 0; i <= GRID_STEPS; i++) {
      const v = niceMin + (range * i) / GRID_STEPS;
      if (Math.abs(v) < 0.0001) continue;
      gridLines.push({ y: scaleY(v), label: formatUsd(v) });
    }

    const bars: BarModel[] = buckets.map((b, i) => {
      const v = values[i] ?? 0;
      const positive = v >= 0;
      const slotStart = PADDING_LEFT + i * slotW;
      const barX = slotStart + (slotW - barW) / 2;
      const yTop = scaleY(Math.max(v, 0));
      const yBottom = scaleY(Math.min(v, 0));
      const height = Math.max(yBottom - yTop, b.trades > 0 ? 1 : 0);
      const valueLabel = formatUsd(v);
      const showLabel = b.trades > 0 && Math.abs(v) > 0;
      const labelY = positive ? yTop - 4 : yBottom + 10;
      return {
        x: barX,
        y: yTop,
        height,
        width: barW,
        positive,
        value: v,
        valueLabel,
        trades: b.trades,
        xLabel: labels[b.key] ?? String(b.key),
        centerX: slotStart + slotW / 2,
        labelY,
        showLabel,
        labelText: TimePerfChartComponent.compactCurrency(v),
      };
    });

    return { isEmpty: false, zeroY, bars, gridLines, clipId: this.clipId };
  });

  private static niceFloor(min: number): number {
    if (min >= 0) return 0;
    const abs = Math.abs(min);
    const exp = Math.floor(Math.log10(abs));
    const pow = Math.pow(10, exp);
    const norm = abs / pow;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return -nice * pow;
  }

  private static niceCeil(max: number): number {
    if (max <= 0) return 0;
    const exp = Math.floor(Math.log10(max));
    const pow = Math.pow(10, exp);
    const norm = max / pow;
    const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return nice * pow;
  }

  private static compactCurrency(v: number): string {
    if (v === 0) return '';
    const sign = v < 0 ? '-' : '';
    const abs = Math.abs(v);
    if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
    return `${sign}$${abs.toFixed(0)}`;
  }
}
