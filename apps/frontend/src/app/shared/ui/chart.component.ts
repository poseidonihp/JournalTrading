import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption } from 'echarts';
import { ThemeService } from '../../core/theme/theme.service';

/**
 * Wrapper de ECharts theme-aware para Fase 4.
 *
 * Uso: <journal-chart [options]="opts" height="280px" />
 *
 * Resuelve los colores (texto, ejes, líneas) desde los tokens CSS `--qp-*`, por lo
 * que respeta el modo claro/oscuro y se re-renderiza al cambiar de tema. Depende de
 * `echarts` directamente (sin atadura a la versión de Angular) y usa el renderer SVG,
 * coherente con el resto de gráficos del proyecto. Compatible con zoneless: el chart
 * vive fuera de Angular y se actualiza vía effects sobre signals.
 */
@Component({
  selector: 'journal-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div #host class="chart-host" [style.height]="height()"></div>`,
  styles: [
    `
      .chart-host {
        width: 100%;
      }
    `,
  ],
})
export class ChartComponent {
  readonly options = input.required<EChartsOption>();
  readonly height = input('260px');

  private readonly host = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private readonly theme = inject(ThemeService);
  private chart: ECharts | undefined;
  private resizeObserver: ResizeObserver | undefined;

  constructor() {
    afterNextRender(() => {
      this.chart = echarts.init(this.host().nativeElement, undefined, { renderer: 'svg' });
      this.resizeObserver = new ResizeObserver(() => this.chart?.resize());
      this.resizeObserver.observe(this.host().nativeElement);
      this.render();
    });

    // Re-render ante cambios de options o de tema.
    effect(() => {
      this.options();
      this.theme.theme();
      if (this.chart) this.render();
    });

    inject(DestroyRef).onDestroy(() => {
      this.resizeObserver?.disconnect();
      this.chart?.dispose();
    });
  }

  private render(): void {
    const chart = this.chart;
    if (!chart) return;

    const css = getComputedStyle(document.documentElement);
    const token = (name: string): string => css.getPropertyValue(name).trim();

    const base: EChartsOption = {
      backgroundColor: 'transparent',
      textStyle: { fontFamily: 'Geist, system-ui, sans-serif', color: token('--qp-ink-soft') },
      grid: { left: 8, right: 12, top: 16, bottom: 8, containLabel: true },
      color: [token('--qp-sage'), token('--qp-clay'), token('--qp-mute')],
      tooltip: {
        backgroundColor: token('--qp-bg-soft'),
        borderColor: token('--qp-line-strong'),
        textStyle: { color: token('--qp-ink') },
      },
    };

    // notMerge=true: cada setOption reemplaza la config (limpia series obsoletas).
    chart.setOption({ ...base, ...this.options() }, true);
  }
}
