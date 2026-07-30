import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { LucideAngularModule, X, Calendar, Clock, Pencil, Trash2 } from 'lucide-angular';
import { enumLabels, type Trade, type TradeMedia } from '@journal/shared-types';
import { formatDateTime, formatDuration, formatUsd, pnlClass } from '../../shared/format';

@Component({
  selector: 'app-trade-detail-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule],
  templateUrl: './trade-detail-drawer.component.html',
  styleUrl: './trade-detail-drawer.component.scss',
})
export class TradeDetailDrawerComponent {
  protected readonly iconClose = X;
  protected readonly iconEdit = Pencil;
  protected readonly iconTrash = Trash2;
  protected readonly iconCalendar = Calendar;
  protected readonly iconClock = Clock;
  protected readonly formatDateTime = formatDateTime;
  protected readonly formatDuration = formatDuration;
  protected readonly formatUsd = formatUsd;
  protected readonly pnlClass = pnlClass;

  protected formatUsdAbs(v: string | number | null | undefined): string {
    if (v === null || v === undefined || v === '') {
      return '$0.00';
    }
    const n = typeof v === 'string' ? Number(v) : v;
    return formatUsd(Math.abs(n));
  }

  readonly trade = input.required<Trade>();
  readonly dismissed = output();
  readonly edited = output();
  readonly removed = output();
  readonly mediaOpened = output<string>();

  protected readonly media = computed<TradeMedia[]>(() => this.trade().media ?? []);
  protected readonly isNetPositive = computed<boolean>(() => Number(this.trade().net) >= 0);

  labelDirection(d: Trade['direction']): string {
    return enumLabels.direction[d];
  }

  labelEmotion(e: Trade['emotion']): string {
    return enumLabels.emotion[e];
  }

  labelExit(r: Trade['exitReason']): string {
    return enumLabels.exitReason[r];
  }
}
