import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { LucideAngularModule, Plus, Trash2, Edit2, Save, X } from 'lucide-angular';
import {
  enumLabels,
  type Account,
  type CapitalMovement,
  type CapitalMovementType,
  type CreateCapitalMovementDto,
} from '@journal/shared-types';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';
import { NotificationService } from '../../core/notifications/notification.service';
import { DialogComponent } from '../../shared/ui/dialog.component';
import { FieldComponent } from '../../shared/ui/field.component';
import { ErrorBannerComponent } from '../../shared/ui/error-banner.component';
import { SubmitButtonComponent } from '../../shared/ui/submit-button.component';
import { dateInputToIsoUtc, formatDate, formatUsd, isoToDateInput } from '../../shared/format';

const movementTypes: CapitalMovementType[] = ['DEPOSIT', 'WITHDRAWAL'];

/**
 * Historial de aportes y retiros de una cuenta, con alta, edición y borrado.
 * Cada cambio recarga las cuentas para que el saldo y el capital aportado que
 * calcula el backend queden al día en el resto de la app.
 * @class
 */
@Component({
  selector: 'app-capital-movements-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    LucideAngularModule,
    FormsModule,
    DialogComponent,
    FieldComponent,
    ErrorBannerComponent,
    SubmitButtonComponent,
  ],
  templateUrl: './capital-movements-dialog.component.html',
  styleUrl: './capital-movements-dialog.component.scss',
})
export class CapitalMovementsDialogComponent implements OnInit {
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconEdit = Edit2;
  protected readonly iconSave = Save;
  protected readonly iconCancel = X;

  protected readonly movementTypes = movementTypes;
  protected readonly maxNoteChars = 300;
  protected readonly formatUsd = formatUsd;
  protected readonly formatDate = formatDate;

  private readonly api = inject(ApiClient);
  private readonly accounts = inject(AccountsStore);
  private readonly confirm = inject(ConfirmService);
  private readonly notify = inject(NotificationService);
  private readonly ref = inject(DialogRef);
  private readonly data = inject<Account>(DIALOG_DATA);

  /**
   * Cuenta en curso leída del store para que los totales del encabezado se
   * refresquen solos tras cada movimiento. Cae en la cuenta con la que se abrió
   * el diálogo mientras el store se recarga.
   */
  protected readonly account = computed<Account>(
    () => this.accounts.accounts().find(account => account.id === this.data.id) ?? this.data,
  );

  protected readonly movements = signal<CapitalMovement[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected readonly draftType = signal<CapitalMovementType>('DEPOSIT');
  protected readonly draftAmount = signal('');
  protected readonly draftDate = signal(isoToDateInput(new Date().toISOString()));
  protected readonly draftNote = signal('');

  protected readonly editingId = signal<string | null>(null);
  protected readonly editType = signal<CapitalMovementType>('DEPOSIT');
  protected readonly editAmount = signal('');
  protected readonly editDate = signal('');
  protected readonly editNote = signal('');

  ngOnInit(): void {
    void this.load();
  }

  protected typeLabel(type: CapitalMovementType): string {
    return enumLabels.capitalMovementType[type];
  }

  protected typeColor(type: CapitalMovementType): string {
    return type === 'DEPOSIT' ? 'var(--qp-sage)' : 'var(--qp-clay)';
  }

  protected signedAmount(movement: CapitalMovement): string {
    const formatted = formatUsd(movement.amount);
    return movement.type === 'DEPOSIT' ? `+${formatted}` : `−${formatted}`;
  }

  protected canSubmitDraft(): boolean {
    return this.draftAmount().trim().length > 0 && this.draftDate().length > 0;
  }

  protected async submitDraft(): Promise<void> {
    const occurredAt = dateInputToIsoUtc(this.draftDate());
    if (!occurredAt || !this.canSubmitDraft()) {
      return;
    }
    const dto: CreateCapitalMovementDto = {
      occurredAt,
      type: this.draftType(),
      amount: this.draftAmount().trim(),
      note: this.draftNote().trim() || null,
    };
    await this.mutate(
      () => this.api.post<CapitalMovement>(this.basePath(), dto),
      'Movimiento registrado',
    );
    this.draftAmount.set('');
    this.draftNote.set('');
  }

  protected startEdit(movement: CapitalMovement): void {
    this.editingId.set(movement.id);
    this.editType.set(movement.type);
    this.editAmount.set(movement.amount);
    this.editDate.set(isoToDateInput(movement.occurredAt));
    this.editNote.set(movement.note ?? '');
    this.errorMessage.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(movement: CapitalMovement): Promise<void> {
    const occurredAt = dateInputToIsoUtc(this.editDate());
    if (!occurredAt || !this.editAmount().trim()) {
      return;
    }
    const dto: CreateCapitalMovementDto = {
      occurredAt,
      type: this.editType(),
      amount: this.editAmount().trim(),
      note: this.editNote().trim() || null,
    };
    await this.mutate(
      () => this.api.patch<CapitalMovement>(`${this.basePath()}/${movement.id}`, dto),
      'Movimiento actualizado',
    );
    this.editingId.set(null);
  }

  protected async removeMovement(movement: CapitalMovement): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar movimiento',
      message: `¿Eliminar el ${this.typeLabel(movement.type).toLowerCase()} de ${formatUsd(movement.amount)}?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    await this.mutate(
      () => this.api.delete(`${this.basePath()}/${movement.id}`),
      'Movimiento eliminado',
    );
  }

  protected close(): void {
    this.ref.close();
  }

  /**
   * Ejecuta una mutación y refresca el historial y los saldos. Centraliza el
   * manejo de error y el toast para no repetirlo en alta, edición y borrado.
   * @param {() => Promise<unknown>} action - Llamada al API
   * @param {string} successMessage - Mensaje del toast al terminar bien
   * @returns {Promise<void>}
   */
  private async mutate(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    this.saving.set(true);
    this.errorMessage.set(null);
    try {
      await action();
      await Promise.all([this.load(), this.accounts.load()]);
      this.notify.success(successMessage);
    } catch (e) {
      this.errorMessage.set(ApiClient.messageFromError(e));
    } finally {
      this.saving.set(false);
    }
  }

  /**
   * Carga el historial de movimientos de la cuenta.
   * @returns {Promise<void>}
   */
  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      this.movements.set(await this.api.get<CapitalMovement[]>(this.basePath()));
    } catch (e) {
      this.errorMessage.set(ApiClient.messageFromError(e));
    } finally {
      this.loading.set(false);
    }
  }

  private basePath(): string {
    return `accounts/${this.data.id}/movements`;
  }
}
