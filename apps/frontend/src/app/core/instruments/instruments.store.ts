import { Injectable, inject, signal } from '@angular/core';
import type {
  Instrument,
  CreateInstrumentDto,
  UpdateInstrumentDto,
} from '@journal/shared-types';
import { ApiClient } from '../http/api.client';

@Injectable({ providedIn: 'root' })
export class InstrumentsStore {
  private readonly api = inject(ApiClient);
  private readonly _list = signal<Instrument[]>([]);
  private readonly _loading = signal<boolean>(false);
  private loaded = false;

  readonly list = this._list.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(force = false): Promise<void> {
    if (this.loaded && !force) {
      return;
    }
    this._loading.set(true);
    try {
      this._list.set(await this.api.get<Instrument[]>('instruments'));
      this.loaded = true;
    } finally {
      this._loading.set(false);
    }
  }

  async create(dto: CreateInstrumentDto): Promise<Instrument> {
    const created = await this.api.post<Instrument>('instruments', dto);
    this._list.update(curr => [...curr, created].sort((a, b) => a.symbol.localeCompare(b.symbol)));
    return created;
  }

  async update(id: string, dto: UpdateInstrumentDto): Promise<Instrument> {
    const updated = await this.api.patch<Instrument>(`instruments/${id}`, dto);
    this._list.update(curr => curr.map(i => (i.id === id ? updated : i)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`instruments/${id}`);
    this._list.update(curr => curr.filter(i => i.id !== id));
  }

  bySymbol(symbol: string): Instrument | undefined {
    return this._list().find(i => i.symbol === symbol);
  }

  byId(id: string): Instrument | undefined {
    return this._list().find(i => i.id === id);
  }

  reset(): void {
    this._list.set([]);
    this.loaded = false;
  }
}
