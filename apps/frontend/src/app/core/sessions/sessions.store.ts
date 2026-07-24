import { Injectable, inject, signal } from '@angular/core';
import type { Session, UpsertSessionDto } from '@journal/shared-types';
import { ApiClient } from '../http/api.client';

@Injectable({ providedIn: 'root' })
export class SessionsStore {
  private readonly api = inject(ApiClient);

  private readonly _sessions = signal<Session[]>([]);
  private readonly _loading = signal<boolean>(false);

  readonly sessions = this._sessions.asReadonly();
  readonly loading = this._loading.asReadonly();

  async loadMonth(month: string): Promise<void> {
    this._loading.set(true);
    try {
      const list = await this.api.get<Session[]>('sessions', { month });
      this._sessions.set(list);
    } finally {
      this._loading.set(false);
    }
  }

  async upsert(dto: UpsertSessionDto): Promise<Session> {
    const saved = await this.api.put<Session>('sessions', dto);
    this._sessions.update(curr => {
      const idx = curr.findIndex(s => s.date === saved.date);
      if (idx === -1) return [saved, ...curr].sort((a, b) => b.date.localeCompare(a.date));
      const next = [...curr];
      next[idx] = saved;
      return next;
    });
    return saved;
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`sessions/${id}`);
    this._sessions.update(curr => curr.filter(s => s.id !== id));
  }
}
