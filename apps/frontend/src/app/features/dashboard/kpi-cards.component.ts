import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  breakEvenPointsThreshold,
  enumLabels,
  type KpiPoints,
  type KpiSummary,
} from '@journal/shared-types';
import { formatSignedPoints, formatUsd } from '../../shared/format';
import {
  MiniDivergeComponent,
  MiniDonutComponent,
  MiniGaugeComponent,
} from './stats-charts.component';

const secondsPerMinute = 60;
const minutesPerHour = 60;

/**
 * Rejilla de tarjetas KPI (Net P&L, profit factor, win rate, rachas, …).
 * Se comparte entre el dashboard (mes) y reportes (año).
 */
@Component({
  selector: 'app-kpi-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniDonutComponent, MiniDivergeComponent, MiniGaugeComponent],
  templateUrl: './kpi-cards.component.html',
  styleUrl: './kpi-cards.component.scss',
})
export class KpiCardsComponent {
  readonly kpis = input.required<KpiSummary>();

  protected readonly formatUsd = formatUsd;
  protected readonly formatSignedPoints = formatSignedPoints;
  protected readonly Number = Number;

  protected readonly profitFactorLabel = computed(() => {
    const pf = this.kpis().profitFactor;
    if (pf === null || pf === undefined) {
      return '∞';
    }
    return pf.toFixed(2);
  });

  protected readonly winRateLabel = computed(() => `${this.kpis().winRate.toFixed(1)}%`);

  /** Explica que los break-even quedan fuera del denominador del win rate. */
  protected readonly winRateTooltip = computed(() => {
    const kpis = this.kpis();
    const decided = kpis.winningTrades + kpis.losingTrades;
    const scratch = `los ${kpis.breakEvenTrades} break-even (±${breakEvenPointsThreshold} puntos) no cuentan`;
    return `${kpis.winningTrades} de ${decided} operaciones decididas · ${scratch}`;
  });

  protected readonly avgDurationLabel = computed(() => {
    const seconds = this.kpis().avgDurationSeconds;
    if (seconds === 0) {
      return '—';
    }
    const m = Math.floor(seconds / secondsPerMinute);
    const s = seconds % secondsPerMinute;
    if (m >= minutesPerHour) {
      const h = Math.floor(m / minutesPerHour);
      return `${h}h ${m % minutesPerHour}m`;
    }
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  });

  /** Unidad en la que se miden los puntos: futuros en puntos, CFD en pips. */
  protected pointsUnit(category: KpiPoints['category']): string {
    return enumLabels.pointsUnit[category];
  }

  protected pointsTooltip(points: KpiPoints): string {
    const unit = this.pointsUnit(points.category);
    const gross = `Bruto ${formatSignedPoints(points.gross)} ${unit}`;
    const commission = `comisiones ${points.commission} ${unit}`;
    const detail = `ganados ${formatSignedPoints(points.gained)} / perdidos ${formatSignedPoints(points.lost)}`;
    return `${gross} menos ${commission} · ${detail}`;
  }

  protected netTooltip(kpis: KpiSummary): string {
    const gross = formatUsd(kpis.grossPnl);
    const base = `Neto = bruto ${gross} menos comisiones ${formatUsd(kpis.totalCommission)}`;
    if (Number(kpis.dataFees) === 0) {
      return base;
    }
    return `${base} menos fee de data ${formatUsd(kpis.dataFees)}`;
  }
}
