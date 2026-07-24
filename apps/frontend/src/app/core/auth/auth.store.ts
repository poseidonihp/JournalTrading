import { Injectable, computed, inject, signal } from '@angular/core';
import type {
  AuthenticatedUser,
  EncryptedLoginRequest,
  LoginRequest,
} from '@journal/shared-types';
import { ApiClient } from '../http/api.client';
import { PasswordCryptoService } from './password-crypto.service';

interface AuthResponse {
  user: AuthenticatedUser;
}

@Injectable({ providedIn: 'root' })
export class AuthStore {
  private readonly api = inject(ApiClient);
  private readonly crypto = inject(PasswordCryptoService);

  private readonly _user = signal<AuthenticatedUser | null>(null);
  private readonly _loading = signal<boolean>(true);
  private readonly _error = signal<string | null>(null);

  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  async hydrate(): Promise<void> {
    this._loading.set(true);
    try {
      const me = await this.api.get<AuthenticatedUser>('auth/me');
      this._user.set(me);
    } catch {
      try {
        const refreshed = await this.api.post<AuthResponse>('auth/refresh');
        this._user.set(refreshed.user);
      } catch {
        this._user.set(null);
      }
    } finally {
      this._loading.set(false);
    }
  }

  async login(payload: LoginRequest): Promise<void> {
    this._error.set(null);
    this._loading.set(true);
    try {
      const encryptedPassword = await this.crypto.encrypt(payload.password);
      const body: EncryptedLoginRequest = { email: payload.email, encryptedPassword };
      const res = await this.api.post<AuthResponse>('auth/login', body);
      this._user.set(res.user);
    } catch (e) {
      this._error.set(ApiClient.messageFromError(e));
      throw e;
    } finally {
      this._loading.set(false);
    }
  }

  async logout(): Promise<void> {
    try {
      await this.api.post<void>('auth/logout');
    } catch {
      // Ignoramos el error: la sesión queda invalidada en el cliente de todas formas.
    } finally {
      this._user.set(null);
      this._loading.set(false);
      this._error.set(null);
      try {
        sessionStorage.setItem('journal:logged-out', '1');
      } catch {
        // sessionStorage no disponible: no es crítico.
      }
    }
  }
}
