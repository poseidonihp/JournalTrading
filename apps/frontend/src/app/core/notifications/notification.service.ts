import { Injectable, signal } from '@angular/core';

export type NotificationKind = 'success' | 'error' | 'info' | 'warning';

export interface Notification {
  id: number;
  kind: NotificationKind;
  message: string;
  title?: string;
}

export interface NotificationOptions {
  title?: string;
  /** Milisegundos antes de auto-descartar. 0 = persistente (requiere cierre manual). */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 4500;
const ERROR_TIMEOUT_MS = 7000;

/**
 * Cola de notificaciones (toasts) basada en signals. El host la renderiza.
 * Inyectable global: úsalo desde stores/componentes tras una mutación.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private seq = 0;
  private readonly _items = signal<Notification[]>([]);
  readonly items = this._items.asReadonly();

  success(message: string, opts?: NotificationOptions): number {
    return this.show('success', message, opts);
  }

  error(message: string, opts?: NotificationOptions): number {
    return this.show('error', message, { timeoutMs: ERROR_TIMEOUT_MS, ...opts });
  }

  info(message: string, opts?: NotificationOptions): number {
    return this.show('info', message, opts);
  }

  warning(message: string, opts?: NotificationOptions): number {
    return this.show('warning', message, opts);
  }

  dismiss(id: number): void {
    this._items.update((list) => list.filter((n) => n.id !== id));
  }

  clear(): void {
    this._items.set([]);
  }

  private show(kind: NotificationKind, message: string, opts?: NotificationOptions): number {
    this.seq += 1;
    const id = this.seq;
    this._items.update((list) => [...list, { id, kind, message, title: opts?.title }]);

    const timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (timeout > 0) {
      // Zoneless: escribir el signal en dismiss() agenda la detección de cambios.
      setTimeout(() => this.dismiss(id), timeout);
    }
    return id;
  }
}
