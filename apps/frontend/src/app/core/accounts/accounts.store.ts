import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  Account,
  CreateAccountDto,
  UpdateAccountDto,
} from '@journal/shared-types';
import { ApiClient } from '../http/api.client';

const SELECTED_KEY = 'journal:selectedAccountId';

@Injectable({ providedIn: 'root' })
export class AccountsStore {
  private readonly api = inject(ApiClient);

  private readonly _accounts = signal<Account[]>([]);
  private readonly _selectedId = signal<string | null>(this.readStoredSelection());
  private readonly _loading = signal<boolean>(false);

  readonly accounts = this._accounts.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly activeAccounts = computed(() => this._accounts().filter((a) => a.isActive));
  readonly selectedId = computed(() => {
    const requested = this._selectedId();
    const all = this._accounts();
    if (requested === 'ALL') return 'ALL';
    if (requested && all.some((a) => a.id === requested)) return requested;
    return all[0]?.id ?? null;
  });
  readonly selected = computed(() => {
    const id = this.selectedId();
    if (id === 'ALL' || !id) return null;
    return this._accounts().find((a) => a.id === id) ?? null;
  });

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const list = await this.api.get<Account[]>('accounts');
      this._accounts.set(list);
    } finally {
      this._loading.set(false);
    }
  }

  setSelected(idOrAll: string | 'ALL' | null): void {
    this._selectedId.set(idOrAll);
    this.persistSelection(idOrAll);
  }

  async create(dto: CreateAccountDto): Promise<Account> {
    const created = await this.api.post<Account>('accounts', dto);
    this._accounts.update((curr) => [...curr, created]);
    return created;
  }

  async update(id: string, dto: UpdateAccountDto): Promise<Account> {
    const updated = await this.api.patch<Account>(`accounts/${id}`, dto);
    this._accounts.update((curr) => curr.map((a) => (a.id === id ? updated : a)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`accounts/${id}`);
    this._accounts.update((curr) => curr.filter((a) => a.id !== id));
    if (this._selectedId() === id) this.setSelected(null);
  }

  reset(): void {
    this._accounts.set([]);
    this._selectedId.set(null);
  }

  private readStoredSelection(): string | null {
    try {
      return localStorage.getItem(SELECTED_KEY);
    } catch {
      return null;
    }
  }

  private persistSelection(value: string | 'ALL' | null): void {
    try {
      if (value === null) localStorage.removeItem(SELECTED_KEY);
      else localStorage.setItem(SELECTED_KEY, value);
    } catch {
      /* ignore */
    }
  }
}
