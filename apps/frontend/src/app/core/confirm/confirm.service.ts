import { Injectable, signal } from '@angular/core';

export type ConfirmTone = 'default' | 'danger';

export interface ConfirmOptions {
  /** Texto principal de la pregunta. */
  message: string;
  /** Título corto sobre el mensaje. */
  title?: string;
  /** Etiqueta del botón que confirma. Por defecto "Confirmar". */
  confirmLabel?: string;
  /** Etiqueta del botón que cancela. Por defecto "Cancelar". */
  cancelLabel?: string;
  /** Estilo del botón de confirmación. "danger" para acciones destructivas. */
  tone?: ConfirmTone;
}

export interface ConfirmRequest extends Required<Omit<ConfirmOptions, 'title'>> {
  id: number;
  title?: string;
  resolve: (confirmed: boolean) => void;
}

/**
 * Diálogo de confirmación basado en signals, en sustitución de `window.confirm`.
 * `ask()` devuelve una promesa que se resuelve cuando el usuario decide.
 * El host (ConfirmHostComponent) lo renderiza; se monta una sola vez en la raíz.
 */
@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private seq = 0;
  private readonly _request = signal<ConfirmRequest | null>(null);
  readonly request = this._request.asReadonly();

  /** Pregunta al usuario y resuelve a `true` si confirma, `false` si cancela. */
  ask(options: ConfirmOptions | string): Promise<boolean> {
    const opts = typeof options === 'string' ? { message: options } : options;
    this.seq += 1;
    return new Promise<boolean>((resolve): void => {
      this._request.set({
        id: this.seq,
        message: opts.message,
        title: opts.title,
        confirmLabel: opts.confirmLabel ?? 'Confirmar',
        cancelLabel: opts.cancelLabel ?? 'Cancelar',
        tone: opts.tone ?? 'default',
        resolve,
      });
    });
  }

  /** Resuelve la petición activa y la cierra. */
  resolve(confirmed: boolean): void {
    const current = this._request();
    if (!current) {
      return;
    }
    this._request.set(null);
    current.resolve(confirmed);
  }
}
