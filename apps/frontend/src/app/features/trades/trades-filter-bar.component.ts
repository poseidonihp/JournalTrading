import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, X } from 'lucide-angular';
import {
  EmotionEnum,
  ExitReasonEnum,
  TradeDirectionEnum,
  enumLabels,
} from '@journal/shared-types';
import { InstrumentsStore } from '../../core/instruments/instruments.store';
import { TradeTypesStore } from '../../core/trade-types/trade-types.store';
import { InsightsStore } from '../dashboard/insights.store';
import {
  MonthPickerComponent,
  type IMonthSelection,
} from '../../shared/ui/month-picker.component';
import { monthKey, parseMonthKey, yearFromIso, yearRange } from '../../shared/months';
import {
  TRADE_DENSITIES,
  TRADE_SORTS,
  TradesStore,
  type ClientTradeFilters,
  type ITradePeriod,
  type TradeDensity,
  type TradeSort,
} from './trades.store';

type FilterKey = Exclude<keyof ClientTradeFilters, 'page' | 'pageSize'>;

interface FilterChange<K extends FilterKey = FilterKey> {
  key: K;
  value: ClientTradeFilters[K] | undefined;
}

@Component({
  selector: 'app-trades-filter-bar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, LucideAngularModule, MonthPickerComponent],
  templateUrl: './trades-filter-bar.component.html',
  styleUrl: './trades-filter-bar.component.scss',
})
export class TradesFilterBarComponent implements OnInit {
  protected readonly iconClear = X;
  protected readonly store = inject(TradesStore);
  protected readonly instruments = inject(InstrumentsStore);
  protected readonly tradeTypesStore = inject(TradeTypesStore);
  private readonly insights = inject(InsightsStore);

  protected readonly tradeTypes = this.tradeTypesStore.types;
  protected readonly monthKeys = this.insights.availableMonths;
  protected readonly filterYear = computed(() => {
    const filters = this.store.filters();
    return parseMonthKey(filters.month)?.year ?? yearFromIso(filters.from);
  });
  protected readonly filterMonth = computed(
    () => parseMonthKey(this.store.filters().month)?.month ?? null,
  );
  protected readonly directions = TradeDirectionEnum.options;
  protected readonly emotions = EmotionEnum.options;
  protected readonly exitReasons = ExitReasonEnum.options;
  protected readonly sorts = TRADE_SORTS;
  protected readonly densities = TRADE_DENSITIES;

  private readonly sortLabels: Record<TradeSort, string> = {
    recent: 'Más reciente',
    oldest: 'Más antiguo',
    best: 'Mejor neto',
    worst: 'Peor neto',
  };

  private readonly densityLabels: Record<TradeDensity, string> = {
    compact: 'Compacto',
    cozy: 'Cómodo',
    roomy: 'Espacioso',
  };

  ngOnInit(): void {
    void this.insights.loadAvailableMonths().catch(() => undefined);
  }

  /** Aplica el periodo elegido: un mes, el año completo, o sin filtro de fecha. */
  onPeriodChange(selection: IMonthSelection): void {
    this.store.setPeriod(TradesFilterBarComponent.toPeriod(selection));
    void this.store.load();
  }

  labelSort(s: TradeSort): string {
    return this.sortLabels[s];
  }

  labelDensity(d: TradeDensity): string {
    return this.densityLabels[d];
  }

  onSortChange(event: Event): void {
    const v = this.pickValue(event);
    if ((TRADE_SORTS as readonly string[]).includes(v)) {
      this.store.setSort(v as TradeSort);
    }
  }

  onDensityChange(event: Event): void {
    const v = this.pickValue(event);
    if ((TRADE_DENSITIES as readonly string[]).includes(v)) {
      this.store.setDensity(v as TradeDensity);
    }
  }

  pickValue(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  pickEnum<T extends string>(event: Event, allowed: readonly T[]): T | undefined {
    const v = this.pickValue(event);
    return allowed.includes(v as T) ? (v as T) : undefined;
  }

  labelDirection(d: (typeof TradeDirectionEnum.options)[number]): string {
    return enumLabels.direction[d];
  }

  labelEmotion(e: (typeof EmotionEnum.options)[number]): string {
    return enumLabels.emotion[e];
  }

  labelExit(r: (typeof ExitReasonEnum.options)[number]): string {
    return enumLabels.exitReason[r];
  }

  hasActive(): boolean {
    const f = this.store.filters();
    return [
      f.month,
      f.from,
      f.instrumentId,
      f.tradeTypeId,
      f.direction,
      f.emotion,
      f.exitReason,
    ].some(Boolean);
  }

  private static toPeriod(selection: IMonthSelection): ITradePeriod {
    if (selection.year === null) {
      return {};
    }
    if (selection.month === null) {
      return yearRange(selection.year);
    }
    return { month: monthKey(selection.year, selection.month) };
  }

  pickTradeTypeId(event: Event): string | undefined {
    const v = this.pickValue(event);
    if (!v) return undefined;
    return this.tradeTypes().some(t => t.id === v) ? v : undefined;
  }

  onChange<K extends FilterKey>(change: FilterChange<K>): void {
    this.store.setFilter(change.key, change.value);
    void this.store.load();
  }

  clear(): void {
    this.store.clearFilters();
    void this.store.load();
  }
}
