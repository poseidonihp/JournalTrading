import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { YearlyMonth } from '@journal/shared-types';

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const ROW_HEIGHT = 22;
const BAR_HEIGHT = 12;
const LABEL_W = 36;
const VALUE_W = 64;
const PADDING_X = 8;

interface BarRow {
  label: string;
  value: number;
  valueLabel: string;
  positive: boolean;
  x: number;
  width: number;
  zeroX: number;
  y: number;
}

interface RenderModel {
  isEmpty: boolean;
  rows: BarRow[];
  height: number;
  zeroX: number;
  width: number;
}

@Component({
  selector: 'app-monthly-bars',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (model().isEmpty) {
      <div class="py-12 text-center text-sm" style="color: var(--qp-mute-2);">
        Sin datos.
      </div>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + model().width + ' ' + model().height"
           preserveAspectRatio="xMidYMid meet"
           class="w-full"
           [style.height.px]="model().height">
        <line [attr.x1]="model().zeroX" y1="0" [attr.x2]="model().zeroX" [attr.y2]="model().height"
              stroke="var(--qp-line-strong)" stroke-width="1" />
        @for (r of model().rows; track r.label) {
          <text [attr.x]="8" [attr.y]="r.y + 8" font-size="10"
                fill="var(--qp-mute-2)" font-weight="500">{{ r.label }}</text>
          <rect [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.width" [attr.height]="12" rx="2"
                [attr.fill]="r.positive ? 'var(--qp-sage)' : 'var(--qp-clay)'"
                fill-opacity="0.85" />
          <text [attr.x]="r.positive ? r.x + r.width + 6 : r.x - 6"
                [attr.y]="r.y + 9" font-size="10"
                [attr.text-anchor]="r.positive ? 'start' : 'end'"
                [attr.fill]="r.positive ? 'var(--qp-sage)' : 'var(--qp-clay)'"
                font-weight="600">{{ r.valueLabel }}</text>
        }
      </svg>
    }
  `,
})
export class MonthlyBarsComponent {
  readonly months = input.required<YearlyMonth[]>();
  /** 'points' | 'net' */
  readonly metric = input<'points' | 'net'>('points');
  readonly chartWidth = input<number>(380);

  protected readonly model = computed<RenderModel>(() => {
    const width = this.chartWidth();
    const months = this.months();
    if (months.length === 0) {
      return { isEmpty: true, rows: [], height: ROW_HEIGHT, zeroX: width / 2, width };
    }
    const metric = this.metric();
    const values = months.map(m => Number(metric === 'points' ? m.points : m.net));
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const absMax = Math.max(Math.abs(max), Math.abs(min), 1);
    const innerStart = LABEL_W + PADDING_X;
    const innerEnd = width - VALUE_W;
    const innerW = innerEnd - innerStart;
    const zeroX = min < 0 && max > 0
      ? innerStart + (Math.abs(min) / (Math.abs(min) + Math.abs(max))) * innerW
      : (min >= 0 ? innerStart : innerEnd);
    const scale = (v: number): number => {
      if (v >= 0) {
        const space = innerEnd - zeroX;
        return (Math.abs(v) / absMax) * space;
      }
      const space = zeroX - innerStart;
      return (Math.abs(v) / absMax) * space;
    };
    const rows: BarRow[] = months.map((m, i) => {
      const v = values[i] ?? 0;
      const positive = v >= 0;
      const w = scale(v);
      const x = positive ? zeroX : zeroX - w;
      const label = MONTH_LABELS[m.month - 1] ?? '';
      const valueLabel = MonthlyBarsComponent.formatValue(v, metric);
      return {
        label,
        value: v,
        valueLabel,
        positive,
        x,
        width: Math.max(w, 0.5),
        zeroX,
        y: i * ROW_HEIGHT + (ROW_HEIGHT - BAR_HEIGHT) / 2,
      };
    });
    return {
      isEmpty: false,
      rows,
      height: months.length * ROW_HEIGHT,
      zeroX,
      width,
    };
  });

  private static formatValue(v: number, metric: 'points' | 'net'): string {
    if (v === 0) return '—';
    if (metric === 'net') {
      const sign = v < 0 ? '-' : '';
      return `${sign}$${Math.abs(v).toFixed(0)}`;
    }
    return v.toFixed(2);
  }
}
