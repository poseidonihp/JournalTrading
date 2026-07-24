import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { YearlyMonth } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';

const WIDTH = 1100;
const HEIGHT = 280;
const PADDING_LEFT = 64;
const PADDING_RIGHT = 24;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 32;
const GRID_STEPS = 5;
const SMOOTHING = 0.22;

interface GridLine { y: number; label: string }
interface XTick { x: number; label: string }
interface DotModel { x: number; y: number; positive: boolean }

interface RenderModel {
  isEmpty: boolean;
  path: string;
  area: string;
  zeroY: number;
  clipId: string;
  gridLines: GridLine[];
  xTicks: XTick[];
  dots: DotModel[];
  hasPositive: boolean;
  hasNegative: boolean;
}

const MONTH_LABELS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${counter}`;
}

@Component({
  selector: 'app-yearly-curve',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (model().isEmpty) {
      <div class="py-16 text-center text-sm" style="color: var(--qp-mute-2);">
        Sin trades en el año seleccionado.
      </div>
    } @else {
      <svg viewBox="0 0 1100 280" preserveAspectRatio="none" class="w-full h-[280px]">
        <defs>
          <linearGradient [attr.id]="'yc-pos-' + model().clipId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--qp-sage)" stop-opacity="0.45" />
            <stop offset="100%" stop-color="var(--qp-sage)" stop-opacity="0.05" />
          </linearGradient>
          <linearGradient [attr.id]="'yc-neg-' + model().clipId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--qp-clay)" stop-opacity="0.05" />
            <stop offset="100%" stop-color="var(--qp-clay)" stop-opacity="0.45" />
          </linearGradient>
          <clipPath [attr.id]="'yc-pos-clip-' + model().clipId">
            <rect x="0" y="0" width="1100" [attr.height]="model().zeroY" />
          </clipPath>
          <clipPath [attr.id]="'yc-neg-clip-' + model().clipId">
            <rect x="0" [attr.y]="model().zeroY" width="1100" [attr.height]="280 - model().zeroY" />
          </clipPath>
        </defs>

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

        @if (model().hasPositive) {
          <path [attr.d]="model().area" [attr.fill]="'url(#yc-pos-' + model().clipId + ')'"
            [attr.clip-path]="'url(#yc-pos-clip-' + model().clipId + ')'" />
        }
        @if (model().hasNegative) {
          <path [attr.d]="model().area" [attr.fill]="'url(#yc-neg-' + model().clipId + ')'"
            [attr.clip-path]="'url(#yc-neg-clip-' + model().clipId + ')'" />
        }

        <path [attr.d]="model().path" fill="none" stroke="var(--qp-ink)"
          stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"
          vector-effect="non-scaling-stroke" />

        @for (t of model().xTicks; track t.x) {
          <text [attr.x]="t.x" y="264" font-size="10" text-anchor="middle" fill="var(--qp-mute-2)">
            {{ t.label }}
          </text>
        }

        @for (d of model().dots; track d.x) {
          <circle [attr.cx]="d.x" [attr.cy]="d.y" r="3.5"
            [attr.fill]="d.positive ? 'var(--qp-sage)' : 'var(--qp-clay)'"
            stroke="var(--qp-bg)" stroke-width="1.5" />
        }
      </svg>
    }
  `,
})
export class YearlyCurveComponent {
  readonly months = input.required<YearlyMonth[]>();

  private readonly clipId = nextId();

  protected readonly model = computed<RenderModel>(() => {
    const months = this.months();
    const clipId = this.clipId;
    if (months.length === 0) {
      return YearlyCurveComponent.empty(clipId);
    }
    const values = months.map(m => Number(m.cumulativeNet));
    const rawMin = Math.min(0, ...values);
    const rawMax = Math.max(0, ...values);
    const niceMin = YearlyCurveComponent.niceFloor(rawMin);
    const niceMax = YearlyCurveComponent.niceCeil(rawMax);
    const range = niceMax - niceMin || 1;
    const usableH = HEIGHT - PADDING_TOP - PADDING_BOTTOM;
    const usableW = WIDTH - PADDING_LEFT - PADDING_RIGHT;
    const scaleY = (v: number): number => PADDING_TOP + ((niceMax - v) / range) * usableH;
    const stepX = months.length === 1 ? 0 : usableW / (months.length - 1);
    const scaleX = (i: number): number => PADDING_LEFT + i * stepX;
    const pts: Array<[number, number]> = values.map((v, i) => [scaleX(i), scaleY(v)]);

    const path = YearlyCurveComponent.smoothPath(pts);
    const zeroY = scaleY(0);
    const area = YearlyCurveComponent.smoothArea(pts, zeroY);

    const gridLines = YearlyCurveComponent.niceGrid(niceMin, niceMax, scaleY);
    const xTicks: XTick[] = months.map((m, i) => ({ x: scaleX(i), label: MONTH_LABELS[m.month - 1] ?? '' }));
    const dots: DotModel[] = months.map((m, i) => ({
      x: scaleX(i),
      y: scaleY(values[i] ?? 0),
      positive: (values[i] ?? 0) >= 0,
    }));

    return {
      isEmpty: false,
      path,
      area,
      zeroY,
      clipId,
      gridLines,
      xTicks,
      dots,
      hasPositive: rawMax > 0,
      hasNegative: rawMin < 0,
    };
  });

  private static empty(clipId: string): RenderModel {
    return {
      isEmpty: true,
      path: '',
      area: '',
      zeroY: PADDING_TOP,
      clipId,
      gridLines: [],
      xTicks: [],
      dots: [],
      hasPositive: false,
      hasNegative: false,
    };
  }

  private static smoothPath(pts: Array<[number, number]>): string {
    if (pts.length === 0) return '';
    if (pts.length === 1) {
      const p = pts[0] as [number, number];
      return `M ${p[0]},${p[1]}`;
    }
    const segs: string[] = [];
    const first = pts[0] as [number, number];
    segs.push(`M ${first[0].toFixed(1)},${first[1].toFixed(1)}`);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] ?? pts[i] ?? first;
      const p1 = pts[i] as [number, number];
      const p2 = pts[i + 1] as [number, number];
      const p3 = pts[i + 2] ?? p2;
      const c1x = p1[0] + (p2[0] - p0[0]) * SMOOTHING;
      const c1y = p1[1] + (p2[1] - p0[1]) * SMOOTHING;
      const c2x = p2[0] - (p3[0] - p1[0]) * SMOOTHING;
      const c2y = p2[1] - (p3[1] - p1[1]) * SMOOTHING;
      segs.push(`C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`);
    }
    return segs.join(' ');
  }

  private static smoothArea(pts: Array<[number, number]>, zeroY: number): string {
    if (pts.length === 0) return '';
    const line = YearlyCurveComponent.smoothPath(pts);
    const first = pts[0] as [number, number];
    const last = pts[pts.length - 1] as [number, number];
    return `${line} L ${last[0].toFixed(1)},${zeroY.toFixed(1)} L ${first[0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  }

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

  private static niceGrid(min: number, max: number, scaleY: (v: number) => number): GridLine[] {
    const total = max - min;
    if (total === 0) return [];
    const out: GridLine[] = [];
    for (let i = 0; i <= GRID_STEPS; i++) {
      const v = min + (total * i) / GRID_STEPS;
      if (Math.abs(v) < 0.0001) continue;
      out.push({ y: scaleY(v), label: formatUsd(v) });
    }
    return out;
  }
}
