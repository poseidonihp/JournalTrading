import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import {
  mentorNotEnoughTradesCode,
  type GenerateMentorReportDto,
  type MentorDigest,
  type MentorReport,
  type MentorReportSummary,
  type MentorStatus,
} from '@journal/shared-types';
import { ApiClient } from '../../core/http/api.client';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { NotificationService } from '../../core/notifications/notification.service';

/** Periodo elegido en el selector: sin año es todo el histórico. */
export interface IMentorPeriod {
  year: number | null;
  month: number | null;
}

/** Motivo por el que no se puede generar, para pintar un vacío y no un error. */
export interface IMentorBlocked {
  code: string;
  message: string;
  minTrades?: number;
}

const consentKey = 'journal:mentorConsent';
const monthDigits = 2;
const reportsEndpoint = 'mentor/reports';

/**
 * Estado de Mentor Mode. La generación nunca es automática: sólo el clic la
 * dispara, para no pagar una llamada cada vez que se cambia de cuenta.
 * @class
 */
@Injectable({ providedIn: 'root' })
export class MentorStore {
  private readonly api = inject(ApiClient);
  private readonly accounts = inject(AccountsStore);
  private readonly notifications = inject(NotificationService);

  private readonly _status = signal<MentorStatus | null>(null);
  private readonly _digest = signal<MentorDigest | null>(null);
  private readonly _report = signal<MentorReport | null>(null);
  private readonly _history = signal<MentorReportSummary[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _generating = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);
  private readonly _blocked = signal<IMentorBlocked | null>(null);
  private readonly _consent = signal<boolean>(readConsent());

  readonly status = this._status.asReadonly();
  readonly digest = this._digest.asReadonly();
  readonly report = this._report.asReadonly();
  readonly history = this._history.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly generating = this._generating.asReadonly();
  readonly error = this._error.asReadonly();
  readonly blocked = this._blocked.asReadonly();
  readonly consent = this._consent.asReadonly();

  readonly advice = computed(() => this._report()?.advice ?? null);
  /** El digest del informe manda sobre el del periodo: es el que generó el texto. */
  readonly activeDigest = computed(() => this._report()?.digest ?? this._digest());

  /**
   * Carga el estado del feature y el historial. No genera nada.
   * @returns {Promise<void>}
   */
  async loadStatus(): Promise<void> {
    try {
      const [status, history] = await Promise.all([
        this.api.get<MentorStatus>('mentor/status'),
        this.api.get<MentorReportSummary[]>(reportsEndpoint),
      ]);
      this._status.set(status);
      this._history.set(history);
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
    }
  }

  /**
   * Carga el digest determinista del periodo. Funciona sin OpenAI.
   * @param {IMentorPeriod} period - Periodo elegido
   * @returns {Promise<void>}
   */
  async loadDigest(period: IMentorPeriod): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    this._blocked.set(null);
    try {
      this._digest.set(await this.api.get<MentorDigest>('mentor/digest', this.params(period)));
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
      this._digest.set(null);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Pide el análisis al backend. Si el digest no cambió, vuelve del cache sin
   * llamar al proveedor.
   * @param {IMentorPeriod} period - Periodo elegido
   * @returns {Promise<void>}
   */
  async generate(period: IMentorPeriod): Promise<void> {
    this._generating.set(true);
    this._error.set(null);
    this._blocked.set(null);
    try {
      const body: GenerateMentorReportDto = { ...this.params(period), consent: true };
      const report = await this.api.post<MentorReport>(reportsEndpoint, body);
      this._report.set(report);
      this._digest.set(report.digest);
      await this.refreshHistory();
      this.notifyResult(report);
    } catch (err) {
      this.handleGenerateError(err);
    } finally {
      this._generating.set(false);
    }
  }

  /**
   * Abre un informe del historial.
   * @param {string} id - Informe a abrir
   * @returns {Promise<void>}
   */
  async openReport(id: string): Promise<void> {
    this._loading.set(true);
    this._error.set(null);
    try {
      const report = await this.api.get<MentorReport>(`mentor/reports/${id}`);
      this._report.set(report);
      this._digest.set(report.digest);
    } catch (err) {
      this._error.set(ApiClient.messageFromError(err));
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Borra un informe del historial.
   * @param {string} id - Informe a borrar
   * @returns {Promise<void>}
   */
  async remove(id: string): Promise<void> {
    try {
      await this.api.delete(`mentor/reports/${id}`);
      this._history.update(list => list.filter(item => item.id !== id));
      if (this._report()?.id === id) {
        this._report.set(null);
      }
      this.notifications.success('Informe eliminado');
    } catch (err) {
      this.notifications.error(ApiClient.messageFromError(err));
    }
  }

  /** Limpia el informe en pantalla al cambiar de cuenta o de periodo. */
  clearReport(): void {
    this._report.set(null);
  }

  /** El usuario aceptó que las notas del periodo viajen al proveedor. */
  acceptConsent(): void {
    this._consent.set(true);
    try {
      localStorage.setItem(consentKey, 'true');
    } catch {
      // El consentimiento vale para la sesión aunque no se pueda persistir.
    }
  }

  async refreshHistory(): Promise<void> {
    try {
      this._history.set(await this.api.get<MentorReportSummary[]>(reportsEndpoint));
    } catch {
      // El historial es accesorio: su fallo no debe tapar el informe en pantalla.
    }
  }

  /** ¿Ya existe un informe guardado para este periodo y alcance? */
  hasReportFor(periodLabel: string, accountLabel: string): boolean {
    return this._history().some(
      item => item.periodLabel === periodLabel && item.accountLabel === accountLabel,
    );
  }

  private notifyResult(report: MentorReport): void {
    if (report.status === 'NO_ADVICE') {
      this.notifications.info('El análisis con IA no está configurado: se muestran sólo los datos');
      return;
    }
    this.notifications.success(
      report.cached ? 'Informe recuperado del historial' : 'Análisis listo',
    );
  }

  /**
   * «No hay suficientes trades» es un estado vacío informativo, no un banner
   * rojo. Por eso el store lee el código del cuerpo del error.
   * @private
   * @param {unknown} err - Error de la petición
   * @returns {void}
   */
  private handleGenerateError(err: unknown): void {
    const body = err instanceof HttpErrorResponse ? (err.error as IMentorBlocked | null) : null;
    if (body?.code === mentorNotEnoughTradesCode || body?.code === 'MIXED_CURRENCIES') {
      this._blocked.set(body);
      return;
    }
    const message = ApiClient.messageFromError(err);
    this._error.set(message);
    this.notifications.error(message);
  }

  private params(period: IMentorPeriod): { accountId?: string; month?: string; year?: number } {
    const accountId = this.activeAccountId();
    if (period.year === null) {
      return accountId ? { accountId } : {};
    }
    if (period.month === null) {
      return { ...(accountId ? { accountId } : {}), year: period.year };
    }
    const month = `${period.year}-${String(period.month).padStart(monthDigits, '0')}`;
    return { ...(accountId ? { accountId } : {}), month };
  }

  private activeAccountId(): string | undefined {
    const id = this.accounts.selectedId();
    return id && id !== 'ALL' ? id : undefined;
  }
}

function readConsent(): boolean {
  try {
    return localStorage.getItem(consentKey) === 'true';
  } catch {
    return false;
  }
}
