import { ScrollingModule } from '@angular/cdk/scrolling';
import { Dialog } from '@angular/cdk/dialog';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LucideAngularModule, Plus, Download, Sparkles, Upload } from 'lucide-angular';
import { ImportDialogComponent } from '../imports/import-dialog.component';
import { enumLabels, type Trade, type TradeMedia } from '@journal/shared-types';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { InstrumentsStore } from '../../core/instruments/instruments.store';
import { ConfirmService } from '../../core/confirm/confirm.service';
import { TradesStore } from './trades.store';
import { TradesFilterBarComponent } from './trades-filter-bar.component';
import {
  TradeFormDialogComponent,
  type TradeFormDialogData,
} from './trade-form-dialog.component';
import { TradeDetailDrawerComponent } from './trade-detail-drawer.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { EmptyStateComponent } from '../../shared/ui/empty-state.component';
import {
  formatDate,
  formatDuration,
  formatMonth,
  formatTime,
  formatUsd,
} from '../../shared/format';

interface KpiCounts {
  winners: number;
  losers: number;
  best: number;
  worst: number;
  avgWinner: number;
  avgLoser: number;
}

@Component({
  selector: 'app-trades-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ScrollingModule,
    LucideAngularModule,
    TradesFilterBarComponent,
    TradeDetailDrawerComponent,
    SkeletonComponent,
    EmptyStateComponent,
  ],
  templateUrl: './trades.page.html',
  styleUrl: './trades.page.scss',
})
export class TradesPage {
  protected readonly iconPlus = Plus;
  protected readonly iconDownload = Download;
  protected readonly iconSparkles = Sparkles;
  protected readonly iconUpload = Upload;
  protected readonly formatUsd = formatUsd;
  protected readonly formatDate = formatDate;
  protected readonly formatTime = formatTime;
  protected readonly formatMonth = formatMonth;
  protected readonly formatDuration = formatDuration;
  protected readonly Number = Number;

  private readonly trades = inject(TradesStore);
  private readonly accounts = inject(AccountsStore);
  private readonly instruments = inject(InstrumentsStore);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(Dialog);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly rows = this.trades.sortedItems;
  protected readonly density = this.trades.density;
  protected readonly loading = this.trades.loading;
  protected readonly errorMessage = this.trades.error;
  protected readonly selectedId = signal<string | null>(null);
  protected readonly selected = computed(() => {
    const id = this.selectedId();
    if (!id) {
      return null;
    }
    return this.rows().find((r) => r.id === id) ?? null;
  });

  protected readonly netSum = computed(() =>
    this.rows().reduce((acc, r) => acc + Number(r.net), 0),
  );

  protected readonly tradeCount = computed(() => this.rows().length);

  protected readonly kpiCounts = computed<KpiCounts>(() => {
    const rs = this.rows();
    let winners = 0;
    let losers = 0;
    let best = 0;
    let worst = 0;
    let sumW = 0;
    let sumL = 0;
    for (const r of rs) {
      const n = Number(r.net);
      if (n > best) {
        best = n;
      }
      if (n < worst) {
        worst = n;
      }
      if (n > 0) {
        winners += 1;
        sumW += n;
      } else if (n < 0) {
        losers += 1;
        sumL += n;
      }
    }
    return {
      winners,
      losers,
      best,
      worst,
      avgWinner: winners > 0 ? sumW / winners : 0,
      avgLoser: losers > 0 ? sumL / losers : 0,
    };
  });

  protected readonly winRate = computed(() => {
    const { winners, losers } = this.kpiCounts();
    const total = winners + losers;
    if (total === 0) {
      return '—';
    }
    return ((winners / total) * 100).toFixed(1);
  });

  protected readonly profitFactor = computed(() => {
    const { avgWinner, avgLoser, winners, losers } = this.kpiCounts();
    const gross = avgWinner * winners;
    const loss = Math.abs(avgLoser * losers);
    if (loss === 0) {
      return winners > 0 ? '∞' : '—';
    }
    return (gross / loss).toFixed(2);
  });

  protected readonly expectancy = computed(() => {
    const n = this.tradeCount();
    return n === 0 ? 0 : this.netSum() / n;
  });

  protected readonly activeDays = computed(() => {
    const set = new Set<string>();
    for (const r of this.rows()) {
      set.add(r.enteredAt.slice(0, 10));
    }
    return set.size;
  });

  protected readonly rangeLabel = computed(() => {
    const rs = this.rows();
    if (rs.length === 0) {
      return 'Sin trades';
    }
    const dates = rs.map((r) => r.enteredAt).sort((a, b) => a.localeCompare(b));
    const first = dates.at(0);
    const last = dates.at(-1);
    if (!first || !last) {
      return 'Sin trades';
    }
    return `${formatDate(first)} — ${formatDate(last)}`;
  });

  protected readonly lastImport = computed(() => 'unos minutos');

  protected readonly equityCurve = computed(() => {
    const rs = this.rows();
    if (rs.length === 0) {
      return [0, 0];
    }
    const chronological = [...rs].sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
    const curve: number[] = [0];
    let acc = 0;
    for (const r of chronological) {
      acc += Number(r.net);
      curve.push(acc);
    }
    return curve;
  });

  protected readonly sparkLine = computed(() => this.computeSparkPoints().pts);
  protected readonly sparkArea = computed(() => this.computeSparkPoints().area);

  protected readonly exportCsvUrl = computed(() => this.trades.exportCsvUrl());

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await Promise.all([this.accounts.load(), this.instruments.load()]);
    await this.trades.load();
  }

  private computeSparkPoints(): { pts: string; area: string } {
    const w = 160;
    const h = 42;
    const data = this.equityCurve();
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const coords = data.map((v, i) => {
      const x = (i / Math.max(1, data.length - 1)) * w;
      const y = h - ((v - min) / range) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const pts = coords.join(' ');
    const first = coords.at(0)?.split(',')[0] ?? '0';
    const last = coords.at(-1)?.split(',')[0] ?? `${w}`;
    const area = `M${first},${h} L${coords.join(' L')} L${last},${h} Z`;
    return { pts, area };
  }

  protected isDayChange(i: number): boolean {
    const rs = this.rows();
    if (i === 0) {
      return true;
    }
    const prev = rs[i - 1];
    const curr = rs[i];
    if (!prev || !curr) {
      return false;
    }
    return prev.enteredAt.slice(0, 10) !== curr.enteredAt.slice(0, 10);
  }

  protected dayLabel(row: Trade): string {
    return formatDate(row.enteredAt);
  }

  protected formatUsdAbs(v: number | string | null | undefined): string {
    if (v === null || v === undefined || v === '') {
      return '$0.00';
    }
    const n = typeof v === 'string' ? Number(v) : v;
    return formatUsd(Math.abs(n));
  }

  protected formatNum(v: string | number | null | undefined): string {
    if (v === null || v === undefined || v === '') {
      return '—';
    }
    const n = typeof v === 'string' ? Number(v) : v;
    return n.toLocaleString('en-US', { minimumFractionDigits: 2 });
  }

  protected formatPoints(v: string | number | null | undefined): string {
    if (v === null || v === undefined || v === '') {
      return '0.00';
    }
    const n = typeof v === 'string' ? Number(v) : v;
    return n.toFixed(2);
  }

  protected emotionBg(e: Trade['emotion']): string {
    const map: Record<string, string> = {
      CALM: '#E5E9DC',
      DISCIPLINED: '#DDE6E0',
      CONFIDENT: '#E8DFD0',
      ANXIOUS: '#EEDFD3',
      FOMO: '#EBD3CC',
      FRUSTRATED: '#E8CFC9',
      GREEDY: '#EBD3CC',
      FEARFUL: '#EEDFD3',
    };
    return map[e] ?? '#EAE3D2';
  }

  protected firstImage(row: Trade): TradeMedia | null {
    return row.media.find(m => m.kind === 'IMAGE') ?? null;
  }

  protected emotionFg(e: Trade['emotion']): string {
    const map: Record<string, string> = {
      CALM: '#4A5D3A',
      DISCIPLINED: '#3D5A48',
      CONFIDENT: '#6B5638',
      ANXIOUS: '#7A5538',
      FOMO: '#8A3F2E',
      FRUSTRATED: '#8A3F2E',
      GREEDY: '#8A3F2E',
      FEARFUL: '#7A5538',
    };
    return map[e] ?? '#5B5249';
  }

  trackById(_idx: number, row: Trade): string {
    return row.id;
  }

  labelEmotion(e: Trade['emotion']): string {
    return enumLabels.emotion[e];
  }

  /** Descripción accesible de una fila para lectores de pantalla. */
  rowAriaLabel(row: Trade): string {
    const dir = row.direction === 'LONG' ? 'Long' : 'Short';
    const net = `${Number(row.net) >= 0 ? 'positivo' : 'negativo'} ${this.formatUsdAbs(row.net)}`;
    return `${row.instrumentSymbol} ${dir}, ${formatDate(row.enteredAt)}, neto ${net}`;
  }

  labelExit(r: Trade['exitReason']): string {
    return enumLabels.exitReason[r];
  }

  selectTrade(row: Trade): void {
    this.selectedId.set(row.id);
  }

  closeDetail(): void {
    this.selectedId.set(null);
  }

  openImport(): void {
    this.dialog.open(ImportDialogComponent, {
      hasBackdrop: true,
      backdropClass: ['bg-black/40'],
      panelClass: ['p-0'],
      autoFocus: 'first-tabbable',
    });
  }

  openForm(trade?: Trade): void {
    const data: TradeFormDialogData = { trade };
    const ref = this.dialog.open<Trade | null, TradeFormDialogData, TradeFormDialogComponent>(
      TradeFormDialogComponent,
      {
        data,
        hasBackdrop: true,
        backdropClass: ['bg-black/40'],
        panelClass: ['p-0'],
        autoFocus: 'first-tabbable',
        disableClose: true,
      },
    );
    ref.closed.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(result => {
      if (result) {
        this.selectedId.set(result.id);
      }
    });
  }

  async confirmDelete(trade: Trade): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar trade',
      message: `¿Eliminar el trade de ${trade.instrumentSymbol} del ${formatDate(trade.enteredAt)}?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    await this.trades.remove(trade.id);
    this.selectedId.set(null);
  }
}
