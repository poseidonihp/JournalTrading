import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import type { EquityCurve, EquityPoint } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';

const WIDTH = 800;
const HEIGHT = 220;
const PADDING_Y = 24;
const PADDING_X = 28;
const LABEL_OFFSET = 8;
const LABEL_MIN_TOP = 12;
const LABEL_BOTTOM_MARGIN = 4;
const maxMarkerPoints = 40;
const endMarkerRadius = 4.4;
const tipFlipThresholdPx = 64;
const tipEdgePct = 18;

interface CurveMarker {
  key: string;
  y: number;
  leftPct: number;
  positive: boolean;
  isLast: boolean;
  deltaLabel: string;
  accumLabel: string;
  dateLabel: string;
  tipTransform: string;
}

interface RenderModel {
  path: string;
  area: string;
  zero: number;
  min: number;
  max: number;
  net: number;
  startLabel: string;
  endLabel: string;
  tradeCount: number;
  hasPositive: boolean;
  hasNegative: boolean;
  clipId: string;
  lastX: number;
  lastY: number;
  netLabel: string;
  netLabelY: number;
  isEmpty: boolean;
  markers: CurveMarker[];
}

let instanceCounter = 0;
function nextInstanceId(): string {
  instanceCounter += 1;
  return `${instanceCounter}`;
}

function formatDelta(value: number): string {
  const formatted = formatUsd(value);
  return value > 0 ? `+${formatted}` : formatted;
}

@Component({
  selector: 'app-equity-curve',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './equity-curve.component.html',
  styleUrl: './equity-curve.component.scss',
})
export class EquityCurveComponent {
  readonly curve = input.required<EquityCurve>();

  protected readonly endMarkerRadius = endMarkerRadius;
  protected readonly hoveredKey = signal<string | null>(null);

  private readonly clipId = nextInstanceId();

  protected readonly model = computed<RenderModel>(() => {
    const points = this.curve().points;
    const clipId = this.clipId;
    if (points.length === 0) {
      return {
        clipId,
        path: '',
        area: '',
        zero: HEIGHT / 2,
        min: 0,
        max: 0,
        net: 0,
        startLabel: '',
        endLabel: '',
        tradeCount: 0,
        hasPositive: false,
        hasNegative: false,
        lastX: 0,
        lastY: 0,
        netLabel: '',
        netLabelY: 0,
        isEmpty: true,
        markers: [],
      };
    }
    const values = points.map(p => Number(p.cumulativeNet));
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const range = max - min || 1;
    const usableH = HEIGHT - PADDING_Y * 2;
    const usableW = WIDTH - PADDING_X * 2;
    const scaleY = (v: number): number => HEIGHT - PADDING_Y - ((v - min) / range) * usableH;
    const stepX = points.length === 1 ? 0 : usableW / (points.length - 1);
    const coords = values.map(
      (v, i) => `${(PADDING_X + i * stepX).toFixed(1)},${scaleY(v).toFixed(1)}`,
    );
    const path = `M ${coords.join(' L ')}`;
    const firstX = PADDING_X;
    const lastX = PADDING_X + (values.length - 1) * stepX;
    const zeroY = scaleY(0);
    const area = `M ${firstX.toFixed(1)},${zeroY.toFixed(1)} L ${coords.join(' L ')} L ${lastX.toFixed(1)},${zeroY.toFixed(1)} Z`;
    const net = values.at(-1) ?? 0;
    const startLabel = EquityCurveComponent.formatDate(points[0]?.enteredAt);
    const endLabel = EquityCurveComponent.formatDate(points.at(-1)?.enteredAt);
    const lastY = scaleY(net);
    const netLabel = formatUsd(net);
    const netLabelY = net >= 0
      ? Math.max(lastY - LABEL_OFFSET, LABEL_MIN_TOP)
      : Math.min(lastY + LABEL_OFFSET * 2, HEIGHT - LABEL_BOTTOM_MARGIN);
    const markers = EquityCurveComponent.buildMarkers(points, values, stepX, scaleY);
    return {
      clipId,
      path,
      area,
      min,
      max,
      net,
      startLabel,
      endLabel,
      lastX,
      lastY,
      netLabel,
      netLabelY,
      markers,
      zero: scaleY(0),
      tradeCount: points.length,
      hasPositive: max > 0,
      hasNegative: min < 0,
      isEmpty: false,
    };
  });

  protected readonly hoveredMarker = computed<CurveMarker | null>(() => {
    const key = this.hoveredKey();
    if (key === null) {
      return null;
    }
    return this.model().markers.find(marker => marker.key === key) ?? null;
  });

  protected fmt(v: number): string {
    return formatUsd(v);
  }

  /**
   * Construye un punto por trade con los datos que muestra el tooltip.
   * @private
   * @param {EquityPoint[]} points - Puntos de la curva (uno por trade)
   * @param {number[]} values - Acumulado neto de cada punto
   * @param {number} stepX - Separación horizontal entre puntos
   * @param {Function} scaleY - Escala del acumulado a coordenada Y
   * @returns {CurveMarker[]}
   */
  private static buildMarkers(
    points: EquityPoint[],
    values: number[],
    stepX: number,
    scaleY: (v: number) => number,
  ): CurveMarker[] {
    if (points.length > maxMarkerPoints) {
      return [];
    }
    return values.map((value, index) => {
      const delta = Number(points[index]?.tradeNet ?? 0);
      const y = scaleY(value);
      const leftPct = ((PADDING_X + index * stepX) / WIDTH) * 100;
      return {
        y,
        leftPct,
        key: `${index}`,
        isLast: index === values.length - 1,
        positive: delta >= 0,
        deltaLabel: formatDelta(delta),
        accumLabel: formatUsd(value),
        dateLabel: EquityCurveComponent.formatDate(points[index]?.enteredAt),
        tipTransform: EquityCurveComponent.tipTransform(leftPct, y),
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

  private static formatDate(iso: string | undefined): string {
    if (!iso) {
      return '';
    }
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: '2-digit' });
  }
}
