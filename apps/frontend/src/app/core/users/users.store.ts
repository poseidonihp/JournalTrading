import { Injectable, inject, signal } from '@angular/core';
import type { User } from '@journal/shared-types';
import { ApiClient } from '../http/api.client';
import { PasswordCryptoService } from '../auth/password-crypto.service';

export interface CreateUserPayload {
  email: string;
  displayName: string;
  password: string;
  timezone?: string;
  locale?: string;
}

export interface UpdateUserPayload {
  email?: string;
  displayName?: string;
  password?: string;
  timezone?: string;
  locale?: string;
}

@Injectable({ providedIn: 'root' })
export class UsersStore {
  private readonly api = inject(ApiClient);
  private readonly passwordCrypto = inject(PasswordCryptoService);

  private readonly _users = signal<User[]>([]);
  private readonly _loading = signal<boolean>(false);

  readonly users = this._users.asReadonly();
  readonly loading = this._loading.asReadonly();

  async load(): Promise<void> {
    this._loading.set(true);
    try {
      const list = await this.api.get<User[]>('users');
      this._users.set(list);
    } finally {
      this._loading.set(false);
    }
  }

  async create(payload: CreateUserPayload): Promise<User> {
    const encryptedPassword = await this.passwordCrypto.encrypt(payload.password);
    const created = await this.api.post<User>('users', {
      email: payload.email,
      displayName: payload.displayName,
      encryptedPassword,
      ...(payload.timezone ? { timezone: payload.timezone } : {}),
      ...(payload.locale ? { locale: payload.locale } : {}),
    });
    this._users.update(curr => [...curr, created]);
    return created;
  }

  async update(id: string, payload: UpdateUserPayload): Promise<User> {
    const body: Record<string, string> = {};
    if (payload.email !== undefined) {
      body['email'] = payload.email;
    }
    if (payload.displayName !== undefined) {
      body['displayName'] = payload.displayName;
    }
    if (payload.timezone !== undefined) {
      body['timezone'] = payload.timezone;
    }
    if (payload.locale !== undefined) {
      body['locale'] = payload.locale;
    }
    if (payload.password !== undefined && payload.password !== '') {
      body['encryptedPassword'] = await this.passwordCrypto.encrypt(payload.password);
    }
    const updated = await this.api.patch<User>(`users/${id}`, body);
    this._users.update(curr => curr.map(u => (u.id === id ? updated : u)));
    return updated;
  }

  async remove(id: string): Promise<void> {
    await this.api.delete(`users/${id}`);
    this._users.update(curr => curr.filter(u => u.id !== id));
  }
}
