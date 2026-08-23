import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { EChartsOption } from 'echarts';
import type {
  MentorAdvice,
  MentorBucket,
  MentorDigest,
  MentorEliminateCandidate,
} from '@journal/shared-types';
import { ChartComponent } from '../../shared/ui/chart.component';
import { ThemeService } from '../../core/theme/theme.service';
import { formatUsd } from '../../shared/format';
import {
  confidenceClass,
  confidenceLabel,
  findBucket,
  formatPct,
  formatPf,
  winRateClass,
} from './mentor.labels';

/** Fila de la tabla: el contrafáctico del digest más la frase de la IA, si citó ese bucket. */
export interface IEliminateRow extends MentorEliminateCandidate {
  bucket: MentorBucket | null;
  note: string | null;
}

/** Barras del gráfico de impacto; sólo las primeras filas caben legibles. */
const chartRows = 6;
const chartRowHeightPx = 34;
const chartBasePx = 40;

/**
 * «Qué eliminar»: tabla rankeada de contrafácticos, construida siempre desde el
 * digest. La IA sólo aporta la nota de la fila; los números nunca salen de su texto.
 * @class
 */
@Component({
  selector: 'app-mentor-eliminate',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartComponent],
  templateUrl: './mentor-eliminate.component.html',
  styleUrl: './mentor-eliminate.component.scss',
})
export class MentorEliminateComponent {
  readonly digest = input.required<MentorDigest | null>();
  readonly advice = input<MentorAdvice | null>(null);

  protected readonly formatUsd = formatUsd;
  protected readonly formatPct = formatPct;
  protected readonly formatPf = formatPf;
  protected readonly winRateClass = winRateClass;
  protected readonly confidenceLabel = confidenceLabel;
  protected readonly confidenceClass = confidenceClass;

  private readonly theme = inject(ThemeService);
  private readonly expanded = signal<string | null>(null);

  protected readonly rows = computed<IEliminateRow[]>(() => {
    const digest = this.digest();
    if (!digest) {
      return [];
    }
    const notes = new Map(
      (this.advice()?.eliminate ?? []).map(item => [
        rowKey(item.dimensionId, item.bucketKey),
        item.text,
      ]),
    );
    return digest.eliminateCandidates.map(candidate => ({
      ...candidate,
      bucket: findBucket(digest, candidate.dimensionId, candidate.bucketKey),
      note: notes.get(rowKey(candidate.dimensionId, candidate.bucketKey)) ?? null,
    }));
  });

  protected readonly chartHeight = computed(
    () => `${chartBasePx + Math.min(this.rows().length, chartRows) * chartRowHeightPx}px`,
  );

  /** El tema se lee dentro del computed para que el gráfico se recoloree al cambiarlo. */
  protected readonly chartOptions = computed<EChartsOption>(() => {
    this.theme.theme();
    const top = this.rows().slice(0, chartRows).reverse();
    const color = token('--qp-clay');
    return {
      grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        valueFormatter: value => formatUsd(Number(value)),
      },
      xAxis: {
        type: 'value',
        axisLabel: { formatter: (value: number) => formatUsd(value) },
        splitLine: { lineStyle: { color: token('--qp-line') } },
      },
      yAxis: {
        type: 'category',
        data: top.map(row => row.label),
        axisLine: { lineStyle: { color: token('--qp-line-strong') } },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          data: top.map(row => Number(row.delta)),
          itemStyle: { color, borderRadius: [0, 4, 4, 0] },
          barMaxWidth: 18,
        },
      ],
    };
  });

  protected isExpanded(row: IEliminateRow): boolean {
    return this.expanded() === rowKey(row.dimensionId, row.bucketKey);
  }

  protected toggle(row: IEliminateRow): void {
    const key = rowKey(row.dimensionId, row.bucketKey);
    this.expanded.update(current => (current === key ? null : key));
  }

  protected onRowKeyDown(event: KeyboardEvent, row: IEliminateRow): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.toggle(row);
    }
  }
}

function rowKey(dimensionId: string, bucketKey: string): string {
  return `${dimensionId}::${bucketKey}`;
}

/** Valor actual de un token de color; se resuelve en cada render del computed. */
function token(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
