import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { YearlyMonth } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';
import { monthName, monthNameShort } from '../../shared/months';

const WIDTH = 1100;
const HEIGHT = 280;
const PADDING_LEFT = 64;
const PADDING_RIGHT = 24;
const PADDING_TOP = 24;
const PADDING_BOTTOM = 32;
const GRID_STEPS = 5;
const SMOOTHING = 0.22;
const tipFlipThresholdPx = 72;
const tipEdgePct = 16;
const niceStepOne = 1;
const niceStepTwo = 2;
const niceStepFive = 5;
const niceStepTen = 10;

interface GridLine { y: number; label: string }
interface XTick { x: number; label: string }

interface MonthMarker {
  key: number;
  y: number;
  leftPct: number;
  positive: boolean;
  hasTrades: boolean;
  monthLabel: string;
  netLabel: string;
  accumLabel: string;
  tradesLabel: string;
  tipTransform: string;
}

interface RenderModel {
  isEmpty: boolean;
  path: string;
  area: string;
  zeroY: number;
  clipId: string;
  gridLines: GridLine[];
  xTicks: XTick[];
  markers: MonthMarker[];
  hasPositive: boolean;
  hasNegative: boolean;
}

function formatDelta(value: number): string {
  const formatted = formatUsd(value);
  return value > 0 ? `+${formatted}` : formatted;
}

let counter = 0;
function nextId(): string {
  counter += 1;
  return `${counter}`;
}

@Component({
  selector: 'app-yearly-curve',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './yearly-curve.component.html',
  styleUrl: './yearly-curve.component.scss',
})
export class YearlyCurveComponent {
  readonly months = input.required<YearlyMonth[]>();

  protected readonly hoveredKey = signal<number | null>(null);

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
    const xTicks: XTick[] = months.map((m, i) => ({ x: scaleX(i), label: monthNameShort(m.month) }));
    const markers = YearlyCurveComponent.buildMarkers(months, values, scaleX, scaleY);

    return {
      isEmpty: false,
      path,
      area,
      zeroY,
      clipId,
      gridLines,
      xTicks,
      markers,
      hasPositive: rawMax > 0,
      hasNegative: rawMin < 0,
    };
  });

  protected readonly hoveredMarker = computed<MonthMarker | null>(() => {
    const key = this.hoveredKey();
    if (key === null) {
      return null;
    }
    return this.model().markers.find(marker => marker.key === key) ?? null;
  });

  /**
   * Construye un punto por mes con los datos que muestra el tooltip.
   * @private
   * @param {YearlyMonth[]} months - Meses del año consultado
   * @param {number[]} values - Acumulado neto de cada mes
   * @param {Function} scaleX - Escala del índice del mes a coordenada X
   * @param {Function} scaleY - Escala del acumulado a coordenada Y
   * @returns {MonthMarker[]}
   */
  private static buildMarkers(
    months: YearlyMonth[],
    values: number[],
    scaleX: (i: number) => number,
    scaleY: (v: number) => number,
  ): MonthMarker[] {
    return months.map((month, index) => {
      const accum = values[index] ?? 0;
      const y = scaleY(accum);
      const leftPct = (scaleX(index) / WIDTH) * 100;
      return {
        y,
        leftPct,
        key: month.month,
        positive: accum >= 0,
        hasTrades: month.trades > 0,
        monthLabel: monthName(month.month),
        netLabel: formatDelta(Number(month.net)),
        accumLabel: formatUsd(accum),
        tradesLabel: month.trades === 1 ? '1 trade' : `${month.trades} trades`,
        tipTransform: YearlyCurveComponent.tipTransform(leftPct, y),
      };
    });
  }

  /**
   * Ubica el tooltip sobre el punto, girándolo hacia dentro en bordes y arriba.
   * @private
   * @param {number} leftPct - Posición horizontal del punto en porcentaje
   * @param {number} y - Posición vertical del punto en px
   * @returns {string} Valor de la propiedad CSS transform
   */
  private static tipTransform(leftPct: number, y: number): string {
    const vertical = y > tipFlipThresholdPx ? 'calc(-100% - 12px)' : '12px';
    if (leftPct <= tipEdgePct) {
      return `translate(-12px, ${vertical})`;
    }
    if (leftPct >= 100 - tipEdgePct) {
      return `translate(calc(-100% + 12px), ${vertical})`;
    }
    return `translate(-50%, ${vertical})`;
  }

  private static empty(clipId: string): RenderModel {
    return {
      isEmpty: true,
      path: '',
      area: '',
      zeroY: PADDING_TOP,
      clipId,
      gridLines: [],
      xTicks: [],
      markers: [],
      hasPositive: false,
      hasNegative: false,
    };
  }

  private static smoothPath(pts: Array<[number, number]>): string {
    if (pts.length === 0) {
      return '';
    }
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
    if (pts.length === 0) {
      return '';
    }
    const line = YearlyCurveComponent.smoothPath(pts);
    const first = pts[0] as [number, number];
    const last = pts.at(-1) as [number, number];
    return `${line} L ${last[0].toFixed(1)},${zeroY.toFixed(1)} L ${first[0].toFixed(1)},${zeroY.toFixed(1)} Z`;
  }

  private static niceMultiplier(norm: number): number {
    if (norm <= niceStepOne) {
      return niceStepOne;
    }
    if (norm <= niceStepTwo) {
      return niceStepTwo;
    }
    if (norm <= niceStepFive) {
      return niceStepFive;
    }
    return niceStepTen;
  }

  private static niceFloor(min: number): number {
    if (min >= 0) {
      return 0;
    }
    const abs = Math.abs(min);
    const exp = Math.floor(Math.log10(abs));
    const pow = Math.pow(10, exp);
    const norm = abs / pow;
    const nice = YearlyCurveComponent.niceMultiplier(norm);
    return -nice * pow;
  }

  private static niceCeil(max: number): number {
    if (max <= 0) {
      return 0;
    }
    const exp = Math.floor(Math.log10(max));
    const pow = Math.pow(10, exp);
    const norm = max / pow;
    const nice = YearlyCurveComponent.niceMultiplier(norm);
    return nice * pow;
  }

  private static niceGrid(min: number, max: number, scaleY: (v: number) => number): GridLine[] {
    const total = max - min;
    if (total === 0) {
      return [];
    }
    const out: GridLine[] = [];
    for (let i = 0; i <= GRID_STEPS; i++) {
      const v = min + (total * i) / GRID_STEPS;
      if (Math.abs(v) >= 0.0001) {
        out.push({ y: scaleY(v), label: formatUsd(v) });
      }
    }
    return out;
  }
}
