import { Injectable, inject, signal } from '@angular/core';
import type {
  CreateTradeTypeDto,
  TradeType,
  UpdateTradeTypeDto,
} from '@journal/shared-types';
import { ApiClient } from '../http/api.client';

@Injectable({ providedIn: 'root' })
export class TradeTypesStore {
  private readonly api = inject(ApiClient);

  private readonly _types = signal<TradeType[]>([]);
  private readonly _loading = signal<boolean>(false);

  readonly types = this._types.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const list = await this.api.get<TradeType[]>('trade-types');
      this._types.set(list);
    } finally {
      this._loading.set(false);
    }
  }

  async create(dto: CreateTradeTypeDto): Promise<TradeType> {
    const created = await this.api.post<TradeType>('trade-types', dto);
    this._types.update(curr =>
      [...curr, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
    return created;
  }

  async update(id: string, dto: UpdateTradeTypeDto): Promise<TradeType> {
    const updated = await this.api.patch<TradeType>(`trade-types/${id}`, dto);
    this._types.update(curr => curr.map(t => (t.id === id ? updated : t)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`trade-types/${id}`);
    this._types.update(curr => curr.filter(t => t.id !== id));
  }
}
