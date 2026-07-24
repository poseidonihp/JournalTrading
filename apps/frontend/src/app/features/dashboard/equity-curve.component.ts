import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EquityCurve } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';

const WIDTH = 800;
const HEIGHT = 220;
const PADDING_Y = 24;
const PADDING_X = 28;
const LABEL_OFFSET = 8;
const LABEL_MIN_TOP = 12;
const LABEL_BOTTOM_MARGIN = 4;

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
}

let instanceCounter = 0;
function nextInstanceId(): string {
  instanceCounter += 1;
  return `${instanceCounter}`;
}

@Component({
  selector: 'app-equity-curve',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (model().isEmpty) {
      <div class="py-12 text-center text-sm" style="color: var(--qp-mute-2);">
        Sin trades en el rango seleccionado.
      </div>
    } @else {
      <div class="flex items-center justify-between mb-1 text-[11px]" style="color: var(--qp-mute-2);">
        <span>Max {{ fmt(model().max) }}</span>
        <span
          class="serif text-[13px]"
          [style.color]="model().net >= 0 ? 'var(--qp-sage)' : 'var(--qp-clay)'"
        >
          Neto {{ fmt(model().net) }}
        </span>
        <span>Min {{ fmt(model().min) }}</span>
      </div>
      <svg viewBox="0 0 800 220" preserveAspectRatio="none" class="w-full h-[220px]">
        <defs>
          <clipPath [attr.id]="'eq-pos-' + model().clipId">
            <rect x="0" y="0" width="800" [attr.height]="model().zero" />
          </clipPath>
          <clipPath [attr.id]="'eq-neg-' + model().clipId">
            <rect x="0" [attr.y]="model().zero" width="800" [attr.height]="220 - model().zero" />
          </clipPath>
        </defs>

        <line
          x1="0"
          [attr.y1]="model().zero"
          x2="800"
          [attr.y2]="model().zero"
          stroke="var(--qp-line-strong)"
          stroke-dasharray="4 4"
        />

        @if (model().hasPositive) {
          <path
            [attr.d]="model().area"
            fill="var(--qp-sage)"
            fill-opacity="0.18"
            [attr.clip-path]="'url(#eq-pos-' + model().clipId + ')'"
          />
          <path
            [attr.d]="model().path"
            fill="none"
            stroke="var(--qp-sage)"
            stroke-width="1.8"
            stroke-linejoin="round"
            [attr.clip-path]="'url(#eq-pos-' + model().clipId + ')'"
          />
        }

        @if (model().hasNegative) {
          <path
            [attr.d]="model().area"
            fill="var(--qp-clay)"
            fill-opacity="0.18"
            [attr.clip-path]="'url(#eq-neg-' + model().clipId + ')'"
          />
          <path
            [attr.d]="model().path"
            fill="none"
            stroke="var(--qp-clay)"
            stroke-width="1.8"
            stroke-linejoin="round"
            [attr.clip-path]="'url(#eq-neg-' + model().clipId + ')'"
          />
        }

        <text
          x="4"
          [attr.y]="model().zero - 4"
          font-size="10"
          fill="var(--qp-mute-2)"
        >$0</text>

        <circle
          [attr.cx]="model().lastX"
          [attr.cy]="model().lastY"
          r="3.5"
          [attr.fill]="model().net >= 0 ? 'var(--qp-sage)' : 'var(--qp-clay)'"
          stroke="var(--qp-bg)"
          stroke-width="1.5"
        />
        <text
          [attr.x]="model().lastX - 6"
          [attr.y]="model().netLabelY"
          font-size="11"
          font-weight="600"
          text-anchor="end"
          [attr.fill]="model().net >= 0 ? 'var(--qp-sage)' : 'var(--qp-clay)'"
        >{{ model().netLabel }}</text>
      </svg>
      <div class="flex items-center justify-between mt-1 text-[11px]" style="color: var(--qp-mute-2);">
        <span>{{ model().startLabel }}</span>
        <span>{{ model().tradeCount }} trades</span>
        <span>{{ model().endLabel }}</span>
      </div>
    }
  `,
})
export class EquityCurveComponent {
  readonly curve = input.required<EquityCurve>();

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
      zero: scaleY(0),
      tradeCount: points.length,
      hasPositive: max > 0,
      hasNegative: min < 0,
      isEmpty: false,
    };
  });

  protected fmt(v: number): string {
    return formatUsd(v);
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
