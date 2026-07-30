import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { CalendarMonth } from '@journal/shared-types';
import { formatUsd } from '../../shared/format';

interface DayCell {
  date: string | null;
  day: number | null;
  net: number;
  tradesCount: number;
  fees: number;
  winRate: number;
}

interface WeekSummary {
  weekNumber: number;
  net: number;
  tradingDays: number;
}

interface Row {
  days: DayCell[];
  summary: WeekSummary;
}

const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const DAYS_PER_WEEK = 7;

@Component({
  selector: 'app-calendar-heatmap',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calendar-grid">
      @for (w of weekdays; track w) {
        <div class="weekday-header">{{ w }}</div>
      }
      <div class="weekday-header week-header"></div>

      @for (row of rows(); track row.summary.weekNumber) {
        @for (c of row.days; track $index) {
          @if (c.day === null) {
            <div class="day-cell empty"></div>
          } @else {
            <div
              class="day-cell"
              [class.has-trades]="c.tradesCount > 0"
              [style.background]="bg(c.net, hasMovement(c))"
              [style.color]="fg(c.net, hasMovement(c))"
              [title]="tooltip(c)"
            >
              <div class="day-number">{{ c.day }}</div>
              @if (hasMovement(c)) {
                <div class="day-stats">
                  <div class="pnl">{{ pnl(c.net) }}</div>
                  <div class="meta">{{ meta(c) }}</div>
                </div>
              }
            </div>
          }
        }
        <div class="week-cell">
          <div class="week-label">Week {{ row.summary.weekNumber }}</div>
          <div class="week-pnl" [style.color]="weekColor(row.summary.net)">
            {{ pnl(row.summary.net) }}
          </div>
          <div class="week-days">{{ row.summary.tradingDays }} days</div>
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }

      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr)) minmax(70px, 0.9fr);
        gap: 6px;
        font-size: 11px;
      }

      .weekday-header {
        text-align: center;
        font-weight: 500;
        padding-bottom: 4px;
        color: var(--qp-mute-2);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-size: 10px;
      }

      .day-cell {
        position: relative;
        min-height: 78px;
        border-radius: 8px;
        border: 1px solid var(--qp-line);
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: transform 80ms ease, box-shadow 80ms ease;

        &.empty {
          background: transparent;
          border-color: transparent;
        }

        &.has-trades:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
        }
      }

      .day-number {
        font-size: 11px;
        font-weight: 600;
        opacity: 0.75;
      }

      .day-stats {
        text-align: right;
      }

      .pnl {
        font-size: 12px;
        font-weight: 600;
        line-height: 1.1;
      }

      .meta {
        font-size: 10px;
        opacity: 0.7;
        margin-top: 2px;
      }

      .week-cell {
        min-height: 78px;
        border-radius: 8px;
        border: 1px solid var(--qp-line);
        background: var(--qp-bg);
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        gap: 4px;
      }

      .week-label {
        font-size: 11px;
        font-weight: 600;
        color: var(--qp-ink);
      }

      .week-pnl {
        font-size: 14px;
        font-weight: 700;
        line-height: 1.1;
      }

      .week-days {
        display: inline-block;
        align-self: flex-start;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background: rgba(120, 90, 200, 0.18);
        color: var(--qp-accent, #a78bfa);
      }
    `,
  ],
})
export class CalendarHeatmapComponent {
  readonly calendar = input.required<CalendarMonth>();
  protected readonly weekdays = WEEKDAYS;

  protected readonly rows = computed<Row[]>(() => {
    const c = this.calendar();
    if (!c.days.length) {
      return [];
    }
    const first = c.days[0];
    if (!first) {
      return [];
    }
    const [y, m] = first.date.split('-').map(Number);
    const firstDow = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const offset = (firstDow + 6) % DAYS_PER_WEEK;

    const flat: DayCell[] = [];
    for (let i = 0; i < offset; i++) {
      flat.push({ date: null, day: null, net: 0, tradesCount: 0, fees: 0, winRate: 0 });
    }
    for (const d of c.days) {
      flat.push({
        date: d.date,
        day: Number(d.date.slice(-2)),
        net: Number(d.net),
        tradesCount: d.tradesCount,
        fees: Number(d.fees),
        winRate: d.winRate,
      });
    }
    while (flat.length % DAYS_PER_WEEK !== 0) {
      flat.push({ date: null, day: null, net: 0, tradesCount: 0, fees: 0, winRate: 0 });
    }

    const rows: Row[] = [];
    for (let i = 0; i < flat.length; i += DAYS_PER_WEEK) {
      const days = flat.slice(i, i + DAYS_PER_WEEK);
      const net = days.reduce((acc, d) => acc + d.net, 0);
      const tradingDays = days.filter((d) => d.tradesCount > 0).length;
      rows.push({
        days,
        summary: { weekNumber: rows.length + 1, net, tradingDays },
      });
    }
    return rows;
  });

  /** Un día con fee de data tiene movimiento aunque no se haya operado en él. */
  protected hasMovement(c: DayCell): boolean {
    return c.tradesCount > 0 || c.fees !== 0;
  }

  /** Segunda línea de la celda: trades del día, o el fee si no se operó. */
  protected meta(c: DayCell): string {
    if (c.tradesCount > 0) {
      return `${c.tradesCount}t · ${c.winRate.toFixed(0)}%`;
    }
    return 'fee data';
  }

  protected bg(net: number, hasMovement: boolean): string {
    if (!hasMovement) {
      return 'var(--qp-bg)';
    }
    if (net > 0) {
      return 'rgba(78, 130, 87, 0.18)';
    }
    if (net < 0) {
      return 'rgba(176, 80, 60, 0.18)';
    }
    return 'var(--qp-bg)';
  }

  protected fg(net: number, hasMovement: boolean): string {
    if (!hasMovement) {
      return 'var(--qp-mute-2)';
    }
    if (net > 0) {
      return 'var(--qp-positive)';
    }
    if (net < 0) {
      return 'var(--qp-clay)';
    }
    return 'var(--qp-ink)';
  }

  protected weekColor(net: number): string {
    if (net > 0) {
      return 'var(--qp-positive)';
    }
    if (net < 0) {
      return 'var(--qp-clay)';
    }
    return 'var(--qp-mute-2)';
  }

  protected pnl(net: number): string {
    if (Math.abs(net) >= 1000) {
      const sign = net >= 0 ? '' : '-';
      return `${sign}$${(Math.abs(net) / 1000).toFixed(1)}k`;
    }
    return formatUsd(net);
  }

  protected tooltip(c: DayCell): string {
    if (!c.date) {
      return '';
    }
    const base = `${c.date} · ${c.tradesCount} trades · ${formatUsd(c.net)}`;
    if (c.fees === 0) {
      return base;
    }
    return `${base} · incluye fee de data ${formatUsd(c.fees)}`;
  }
}
