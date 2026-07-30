import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { DrawdownSeries } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';

const WIDTH = 800;
const HEIGHT = 300;
const PADDING_LEFT = 64;
const PADDING_RIGHT = 64;
const PADDING_TOP = 28;
const PADDING_BOTTOM = 36;
const X_TICKS = 6;
const TOOLTIP_W = 96;
const TOOLTIP_H = 34;
const TOOLTIP_GAP = 12;

interface GridLine {
  y: number;
  label: string;
}

interface XTick {
  x: number;
  label: string;
}

interface TooltipModel {
  x: number;
  y: number;
  pointY: number;
  text: string;
  value: string;
  above: boolean;
}

interface RenderModel {
  isEmpty: boolean;
  path: string;
  area: string;
  pointCount: number;
  zeroY: number;
  clipId: string;
  gridLines: GridLine[];
  xTicks: XTick[];
  maxDd: TooltipModel | null;
  currentX: number;
  currentY: number;
  currentLabel: string;
  currentAbove: boolean;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${counter}`;
}

@Component({
  selector: 'app-underwater-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (model().isEmpty) {
      <div class="py-16 text-center text-sm" style="color: var(--qp-mute-2);">
        Sin datos para el rango seleccionado.
      </div>
    } @else {
      <svg viewBox="0 0 800 300" preserveAspectRatio="xMidYMid meet" class="w-full h-auto">
        <defs>
          <linearGradient
            [attr.id]="'uw-grad-' + model().clipId"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stop-color="var(--qp-clay)" stop-opacity="0.04" />
            <stop offset="60%" stop-color="var(--qp-clay)" stop-opacity="0.22" />
            <stop offset="100%" stop-color="var(--qp-clay)" stop-opacity="0.45" />
          </linearGradient>
        </defs>

        @for (g of model().gridLines; track g.y) {
          <line
            x1="64"
            [attr.y1]="g.y"
            x2="736"
            [attr.y2]="g.y"
            stroke="var(--qp-line)"
            stroke-opacity="0.45"
            stroke-dasharray="2 5"
          />
          <text
            x="58"
            [attr.y]="g.y + 3"
            font-size="10"
            text-anchor="end"
            fill="var(--qp-mute-2)"
          >{{ g.label }}</text>
        }

        <line
          x1="64"
          [attr.y1]="model().zeroY"
          x2="736"
          [attr.y2]="model().zeroY"
          stroke="var(--qp-line-strong)"
          stroke-width="1.25"
        />
        <text
          x="58"
          [attr.y]="model().zeroY + 3"
          font-size="10"
          text-anchor="end"
          font-weight="600"
          fill="var(--qp-mute-2)"
        >$0</text>

        <path
          [attr.d]="model().area"
          [attr.fill]="'url(#uw-grad-' + model().clipId + ')'"
        />
        <path
          [attr.d]="model().path"
          fill="none"
          stroke="var(--qp-clay)"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        @for (t of model().xTicks; track t.x) {
          <line
            [attr.x1]="t.x"
            [attr.y1]="model().zeroY"
            [attr.x2]="t.x"
            [attr.y2]="model().zeroY + 4"
            stroke="var(--qp-mute-2)"
            stroke-opacity="0.7"
          />
          <text
            [attr.x]="t.x"
            y="282"
            font-size="10"
            text-anchor="middle"
            fill="var(--qp-mute-2)"
          >{{ t.label }}</text>
        }

        @if (model().maxDd; as m) {
          <line
            [attr.x1]="m.x"
            [attr.y1]="model().zeroY"
            [attr.x2]="m.x"
            [attr.y2]="m.pointY"
            stroke="var(--qp-clay)"
            stroke-opacity="0.45"
            stroke-dasharray="3 3"
          />
          <circle
            [attr.cx]="m.x"
            [attr.cy]="m.pointY"
            r="5"
            fill="var(--qp-clay)"
            stroke="var(--qp-bg)"
            stroke-width="2"
          />
          <rect
            [attr.x]="m.x - 48"
            [attr.y]="m.y"
            width="96"
            height="34"
            rx="6"
            fill="var(--qp-clay)"
          />
          <text
            [attr.x]="m.x"
            [attr.y]="m.y + 13"
            font-size="9"
            text-anchor="middle"
            fill="var(--qp-bg)"
            fill-opacity="0.85"
            font-weight="600"
            letter-spacing="0.5"
          >MAX DD</text>
          <text
            [attr.x]="m.x"
            [attr.y]="m.y + 27"
            font-size="12"
            text-anchor="middle"
            fill="var(--qp-bg)"
            font-weight="700"
          >{{ m.value }}</text>
        }

        <circle
          [attr.cx]="model().currentX"
          [attr.cy]="model().currentY"
          r="5"
          fill="var(--qp-bg)"
          stroke="var(--qp-clay)"
          stroke-width="2"
        />
        <text
          [attr.x]="model().currentX"
          [attr.y]="model().currentAbove ? model().currentY - 12 : model().currentY + 18"
          font-size="10"
          text-anchor="middle"
          fill="var(--qp-mute-2)"
          font-weight="600"
        >Actual · {{ model().currentLabel }}</text>
      </svg>
    }
  `,
})
export class UnderwaterChartComponent {
  readonly series = input.required<DrawdownSeries>();
  readonly granularity = input<'trade' | 'day'>('trade');

  private readonly clipId = nextId();

  protected readonly model = computed<RenderModel>(() => {
    const series = this.series();
    const points = series.points;
    const clipId = this.clipId;
    if (points.length === 0) {
      return UnderwaterChartComponent.emptyModel(clipId);
    }
    const values = points.map(p => Number(p.drawdown));
    const rawMin = Math.min(0, ...values);
    const niceMin = UnderwaterChartComponent.niceFloor(rawMin);
    const max = 0;
    const range = max - niceMin || 1;
    const usableH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const usableW = WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const scaleY = (v: number): number => PADDING_TOP + ((max - v) / range) * usableH;
    const stepX = points.length === 1 ? 0 : usableW / (points.length - 1);
    const scaleX = (i: number): number => PADDING_LEFT + i * stepX;
    const coords = values.map((v, i) => `${scaleX(i).toFixed(1)},${scaleY(v).toFixed(1)}`);
    const path = `M ${coords.join(' L ')}`;
    const zeroY = scaleY(0);
    const firstX = PADDING_LEFT;
    const lastX = PADDING_LEFT + (values.length - 1) * stepX;
    const area = `M ${firstX.toFixed(1)},${zeroY.toFixed(1)} L ${coords.join(' L ')} L ${lastX.toFixed(1)},${zeroY.toFixed(1)} Z`;

    const gridLines = UnderwaterChartComponent.niceGrid(niceMin, scaleY);
    const xTicks = UnderwaterChartComponent.xTicks(points, scaleX, this.granularity());
    const maxDd = UnderwaterChartComponent.maxDdTooltip(values, scaleX, scaleY, zeroY);
    const currentMarker = UnderwaterChartComponent.currentMarker(values, scaleX, scaleY, zeroY);

    return {
      isEmpty: false,
      path,
      area,
      pointCount: points.length,
      zeroY,
      clipId,
      gridLines,
      xTicks,
      maxDd,
      currentX: currentMarker.x,
      currentY: currentMarker.y,
      currentLabel: currentMarker.label,
      currentAbove: currentMarker.above,
    };
  });

  private static emptyModel(clipId: string): RenderModel {
    return {
      isEmpty: true,
      path: '',
      area: '',
      pointCount: 0,
      zeroY: PADDING_TOP,
      clipId,
      gridLines: [],
      xTicks: [],
      maxDd: null,
      currentX: 0,
      currentY: 0,
      currentLabel: '',
      currentAbove: true,
    };
  }

  private static niceFloor(min: number): number {
    if (min >= 0) return 0;
    const abs = Math.abs(min);
    const exp = Math.floor(Math.log10(abs));
    const pow = Math.pow(10, exp);
    const norm = abs / pow;
    let nice: number;
    if (norm <= 1) nice = 1;
    else if (norm <= 2) nice = 2;
    else if (norm <= 5) nice = 5;
    else nice = 10;
    return -nice * pow;
  }

  private static niceGrid(min: number, scaleY: (v: number) => number): GridLine[] {
    if (min >= 0) return [];
    const steps = 4;
    const out: GridLine[] = [];
    for (let i = 1; i <= steps; i++) {
      const v = (min * i) / steps;
      out.push({ y: scaleY(v), label: formatUsd(v) });
    }
    return out;
  }

  private static xTicks(
    points: ReadonlyArray<{ at: string }>,
    scaleX: (i: number) => number,
    granularity: 'trade' | 'day',
  ): XTick[] {
    const tickCount = Math.min(X_TICKS, points.length);
    const out: XTick[] = [];
    for (let i = 0; i < tickCount; i++) {
      const idx = tickCount === 1
        ? 0
        : Math.round((i * (points.length - 1)) / (tickCount - 1));
      const p = points[idx];
      if (p) {
        out.push({
          x: scaleX(idx),
          label: UnderwaterChartComponent.formatLabel(p.at, granularity),
        });
      }
    }
    return out;
  }

  private static maxDdTooltip(
    values: number[],
    scaleX: (i: number) => number,
    scaleY: (v: number) => number,
    zeroY: number,
  ): TooltipModel | null {
    let maxIdx = -1;
    let minVal = 0;
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v !== undefined && v < minVal) {
        minVal = v;
        maxIdx = i;
      }
    }
    if (maxIdx < 0 || minVal >= 0) return null;
    const pointY = scaleY(minVal);
    let x = scaleX(maxIdx);
    x = Math.max(PADDING_LEFT + TOOLTIP_W / 2, Math.min(WIDTH - PADDING_RIGHT - TOOLTIP_W / 2, x));
    const spaceBelow = HEIGHT - PADDING_BOTTOM - pointY;
    const above = spaceBelow < TOOLTIP_H + TOOLTIP_GAP + 8;
    const y = above ? pointY - TOOLTIP_GAP - TOOLTIP_H : pointY + TOOLTIP_GAP;
    return {
      x,
      y,
      pointY,
      text: 'Max DD',
      value: formatUsd(minVal),
      above,
    };
  }

  private static currentMarker(
    values: number[],
    scaleX: (i: number) => number,
    scaleY: (v: number) => number,
    zeroY: number,
  ): { x: number; y: number; label: string; above: boolean } {
    const lastIdx = values.length - 1;
    const lastVal = values[lastIdx] ?? 0;
    const y = scaleY(lastVal);
    return {
      x: scaleX(lastIdx),
      y,
      label: formatUsd(lastVal),
      above: y - zeroY > -8,
    };
  }

  private static formatLabel(value: string | undefined, granularity: 'trade' | 'day'): string {
    if (!value) return '';
    if (granularity === 'day') {
      const [y, m, d] = value.split('-');
      if (!y || !m || !d) return value;
      return `${d}/${m}`;
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
  }
}
