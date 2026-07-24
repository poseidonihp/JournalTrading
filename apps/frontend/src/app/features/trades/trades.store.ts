import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  CreateTradeDto,
  Trade,
  TradeFilters,
  TradeListResponse,
  TradeMedia,
  UpdateTradeDto,
} from '@journal/shared-types';
import { ApiClient } from '../../core/http/api.client';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { NotificationService } from '../../core/notifications/notification.service';

export type ClientTradeFilters = Partial<
  Pick<
    TradeFilters,
    'instrumentId' | 'tradeTypeId' | 'emotion' | 'direction' | 'exitReason' | 'month'
  >
> & {
  page?: number;
  pageSize?: number;
};

const DEFAULT_PAGE_SIZE = 50;

export type TradeSort = 'recent' | 'oldest' | 'best' | 'worst';
export type TradeDensity = 'compact' | 'cozy' | 'roomy';
export const TRADE_SORTS: readonly TradeSort[] = ['recent', 'oldest', 'best', 'worst'];
export const TRADE_DENSITIES: readonly TradeDensity[] = ['compact', 'cozy', 'roomy'];

@Injectable({ providedIn: 'root' })
export class TradesStore {
  private readonly api = inject(ApiClient);
  private readonly accounts = inject(AccountsStore);
  private readonly notify = inject(NotificationService);

  private readonly _items = signal<Trade[]>([]);
  private readonly _total = signal<number>(0);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _filters = signal<ClientTradeFilters>({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  private readonly _sort = signal<TradeSort>('recent');
  private readonly _density = signal<TradeDensity>('cozy');

  readonly items = this._items.asReadonly();
  readonly total = this._total.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly filters = this._filters.asReadonly();
  readonly sort = this._sort.asReadonly();
  readonly density = this._density.asReadonly();

  readonly sortedItems = computed(() => {
    const items = [...this._items()];
    switch (this._sort()) {
      case 'recent':
        return items.sort((a, b) => b.enteredAt.localeCompare(a.enteredAt));
      case 'oldest':
        return items.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt));
      case 'best':
        return items.sort((a, b) => Number(b.net) - Number(a.net));
      case 'worst':
        return items.sort((a, b) => Number(a.net) - Number(b.net));
      default:
        return items;
    }
  });

  setSort(sort: TradeSort): void {
    this._sort.set(sort);
  }

  setDensity(density: TradeDensity): void {
    this._density.set(density);
  }

  async load(): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const params = this.buildParams();
      const res = await this.api.get<TradeListResponse>('trades', params);
      this._items.set(res.items);
      this._total.set(res.total);
    } catch (e) {
      const msg = ApiClient.messageFromError(e);
      this._error.set(msg);
      this.notify.error(msg, { title: 'No se pudieron cargar los trades' });
    } finally {
      this._loading.set(false);
    }
  }

  setFilter<K extends keyof ClientTradeFilters>(key: K, value: ClientTradeFilters[K]): void {
    this._filters.update((curr) => ({ ...curr, [key]: value, page: 1 }));
  }

  clearFilters(): void {
    this._filters.set({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  }

  setPage(page: number): void {
    this._filters.update((curr) => ({ ...curr, page }));
  }

  async create(dto: CreateTradeDto): Promise<Trade> {
    try {
      const created = await this.api.post<Trade>('trades', dto);
      await this.load();
      this.notify.success('Trade creado');
      return created;
    } catch (e) {
      this.notify.error(ApiClient.messageFromError(e), { title: 'No se pudo crear el trade' });
      throw e;
    }
  }

  async update(id: string, dto: UpdateTradeDto): Promise<Trade> {
    try {
      const updated = await this.api.patch<Trade>(`trades/${id}`, dto);
      this._items.update((curr) => curr.map((t) => (t.id === id ? updated : t)));
      this.notify.success('Trade actualizado');
      return updated;
    } catch (e) {
      this.notify.error(ApiClient.messageFromError(e), { title: 'No se pudo actualizar el trade' });
      throw e;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.api.delete(`trades/${id}`);
      this._items.update((curr) => curr.filter((t) => t.id !== id));
      this._total.update((n) => Math.max(0, n - 1));
      this.notify.success('Trade eliminado');
    } catch (e) {
      this.notify.error(ApiClient.messageFromError(e), { title: 'No se pudo eliminar el trade' });
      throw e;
    }
  }

  async uploadMedia(tradeId: string, files: File[]): Promise<TradeMedia[]> {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    const created = await this.api.postForm<TradeMedia[]>(`trades/${tradeId}/media`, form);
    this._items.update((curr) =>
      curr.map((t) => (t.id === tradeId ? { ...t, media: [...t.media, ...created] } : t)),
    );
    return created;
  }

  async deleteMedia(tradeId: string, mediaId: string): Promise<void> {
    await this.api.delete(`trades/${tradeId}/media/${mediaId}`);
    this._items.update((curr) =>
      curr.map((t) =>
        t.id === tradeId ? { ...t, media: t.media.filter((m) => m.id !== mediaId) } : t,
      ),
    );
  }

  exportCsvUrl(): string {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(this.buildParams())) {
      if (v !== undefined && v !== null && v !== '') params.set(k, String(v));
    }
    const qs = params.toString();
    return `/api/trades/export.csv${qs ? `?${qs}` : ''}`;
  }

  private buildParams(): Record<string, string | number | undefined> {
    const f = this._filters();
    const selected = this.accounts.selectedId();
    const accountId = selected && selected !== 'ALL' ? selected : undefined;
    return {
      accountId,
      instrumentId: f.instrumentId,
      tradeTypeId: f.tradeTypeId,
      emotion: f.emotion,
      direction: f.direction,
      exitReason: f.exitReason,
      month: f.month,
      page: f.page,
      pageSize: f.pageSize,
    };
  }
}
