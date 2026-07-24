import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { LucideAngularModule, X, Calendar, Clock, Pencil, Trash2 } from 'lucide-angular';
import {
  enumLabels,
  type Trade,
  type TradeMedia,
} from '@journal/shared-types';
import {
  formatDateTime,
  formatDuration,
  formatUsd,
  pnlClass,
} from '../../shared/format';
import { ImageViewerComponent, type ViewerImage } from '../../shared/image-viewer.component';

@Component({
  selector: 'app-trade-detail-drawer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, ImageViewerComponent],
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
  protected readonly Number = Number;

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

  protected readonly media = computed<TradeMedia[]>(() => this.trade().media ?? []);

  protected readonly viewerImages = computed<ViewerImage[]>(() =>
    this.media()
      .filter(m => m.kind === 'IMAGE')
      .map(m => ({ url: m.url, alt: 'Adjunto' })),
  );

  protected readonly viewerOpen = signal(false);
  protected readonly viewerIndex = signal(0);

  protected openViewer(mediaId: string): void {
    const images = this.media().filter(m => m.kind === 'IMAGE');
    const idx = images.findIndex(m => m.id === mediaId);
    this.viewerIndex.set(Math.max(idx, 0));
    this.viewerOpen.set(true);
  }

  protected closeViewer(): void {
    this.viewerOpen.set(false);
  }

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
