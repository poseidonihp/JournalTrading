import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Dialog } from '@angular/cdk/dialog';
import { LucideAngularModule, Plus, Trash2, Edit2, Save, X, ArrowLeftRight } from 'lucide-angular';
import { type Account, type DataFeeFrequency } from '@journal/shared-types';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';
import { dateInputToIsoUtc, isoToDateInput } from '../../shared/format';
import { CapitalMovementsDialogComponent } from './capital-movements-dialog.component';

const FREQUENCIES: DataFeeFrequency[] = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];

const FREQ_LABELS: Record<DataFeeFrequency, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  ANNUAL: 'Anual',
};

const monthsPerPeriod: Record<DataFeeFrequency, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  ANNUAL: 12,
};

const pastPeriodsOffered: Record<DataFeeFrequency, number> = {
  MONTHLY: 12,
  QUARTERLY: 8,
  ANNUAL: 5,
};

const periodFormatter = new Intl.DateTimeFormat('es', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

interface IFeeStartOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-capital-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, FormsModule],
  templateUrl: './capital.page.html',
  styleUrl: './capital.page.scss',
})
export class CapitalPage implements OnInit {
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconEdit = Edit2;
  protected readonly iconSave = Save;
  protected readonly iconCancel = X;
  protected readonly iconMovements = ArrowLeftRight;

  protected readonly frequencies = FREQUENCIES;
  protected readonly freqLabels = FREQ_LABELS;

  protected freqLabel(f: DataFeeFrequency | null | undefined): string {
    if (!f) {
      return '';
    }
    return FREQ_LABELS[f] ?? '';
  }

  private readonly accounts = inject(AccountsStore);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(Dialog);

  protected readonly accountList = this.accounts.accounts;
  protected readonly loading = this.accounts.loading;

  protected readonly creating = signal(false);
  protected readonly draftName = signal('');
  protected readonly draftBroker = signal('');
  protected readonly draftCurrency = signal('USD');
  protected readonly draftInitial = signal('0');
  protected readonly draftInitialAt = signal('');
  protected readonly draftActive = signal(true);
  protected readonly draftFeeEnabled = signal(false);
  protected readonly draftFeeAmount = signal('0');
  protected readonly draftFeeFrequency = signal<DataFeeFrequency>('MONTHLY');
  protected readonly draftFeeStart = signal('');

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editBroker = signal('');
  protected readonly editCurrency = signal('USD');
  protected readonly editInitial = signal('0');
  protected readonly editInitialAt = signal('');
  protected readonly editActive = signal(true);
  protected readonly editFeeEnabled = signal(false);
  protected readonly editFeeAmount = signal('0');
  protected readonly editFeeFrequency = signal<DataFeeFrequency>('MONTHLY');
  protected readonly editFeeStart = signal('');

  protected readonly draftStartOptions = computed(() =>
    this._startOptions(this.draftFeeFrequency()),
  );
  protected readonly editStartOptions = computed(() =>
    this._startOptionsWith(this.editFeeFrequency(), this.editFeeStart()),
  );

  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.accounts.load();
  }

  protected openCreate(): void {
    this.error.set(null);
    this.draftName.set('');
    this.draftBroker.set('');
    this.draftCurrency.set('USD');
    this.draftInitial.set('0');
    this.draftInitialAt.set('');
    this.draftActive.set(true);
    this.draftFeeEnabled.set(false);
    this.draftFeeAmount.set('0');
    this.draftFeeFrequency.set('MONTHLY');
    this.draftFeeStart.set('');
    this.creating.set(true);
  }

  /**
   * Cambia la frecuencia del fee en el formulario de creación y descarta el
   * periodo retroactivo elegido, porque las opciones dependen de la frecuencia.
   * @param {DataFeeFrequency} frequency - Frecuencia seleccionada
   * @returns {void}
   */
  protected setDraftFrequency(frequency: DataFeeFrequency): void {
    this.draftFeeFrequency.set(frequency);
    this.draftFeeStart.set('');
  }

  /**
   * Cambia la frecuencia del fee en la fila en edición y descarta el periodo
   * retroactivo elegido.
   * @param {DataFeeFrequency} frequency - Frecuencia seleccionada
   * @returns {void}
   */
  protected setEditFrequency(frequency: DataFeeFrequency): void {
    this.editFeeFrequency.set(frequency);
    this.editFeeStart.set('');
  }

  /**
   * Igual que `_startOptions` pero garantizando que el periodo ya guardado siga
   * estando en la lista aunque sea más antiguo que la ventana ofrecida; si no,
   * el select quedaría en blanco y parecería que no se guardó nada.
   * @private
   * @param {DataFeeFrequency} frequency - Frecuencia del fee
   * @param {string} selected - Periodo seleccionado en ISO, o vacío
   * @returns {IFeeStartOption[]}
   */
  private _startOptionsWith(frequency: DataFeeFrequency, selected: string): IFeeStartOption[] {
    const options = this._startOptions(frequency);
    if (!selected || options.some(option => option.value === selected)) {
      return options;
    }
    const start = new Date(selected);
    if (Number.isNaN(start.getTime())) {
      return options;
    }
    return [...options, { value: selected, label: this._periodLabel(start, frequency) }];
  }

  private _startOptions(frequency: DataFeeFrequency): IFeeStartOption[] {
    const months = monthsPerPeriod[frequency];
    const now = new Date();
    const currentPeriodMonth = Math.floor(now.getUTCMonth() / months) * months;
    const options: IFeeStartOption[] = [];
    for (let index = 0; index < pastPeriodsOffered[frequency]; index++) {
      const start = new Date(
        Date.UTC(now.getUTCFullYear(), currentPeriodMonth - index * months, 1),
      );
      options.push({ value: start.toISOString(), label: this._periodLabel(start, frequency) });
    }
    return options;
  }

  /**
   * Etiqueta legible del periodo que arranca en la fecha indicada.
   * @private
   * @param {Date} start - Inicio del periodo (UTC)
   * @param {DataFeeFrequency} frequency - Frecuencia del fee
   * @returns {string}
   */
  private _periodLabel(start: Date, frequency: DataFeeFrequency): string {
    if (frequency === 'ANNUAL') {
      return String(start.getUTCFullYear());
    }
    return periodFormatter.format(start);
  }

  protected cancelCreate(): void {
    this.creating.set(false);
  }

  protected async submitCreate(): Promise<void> {
    const name = this.draftName().trim();
    if (!name) {
      this.error.set('El nombre es obligatorio');
      return;
    }
    try {
      const feeEnabled = this.draftFeeEnabled();
      const feeStart = this.draftFeeStart();
      await this.accounts.create({
        name,
        broker: this.draftBroker().trim() || null,
        currency: this.draftCurrency().trim().toUpperCase(),
        initialBalance: this.draftInitial().trim() || '0',
        initialBalanceAt: dateInputToIsoUtc(this.draftInitialAt()),
        isActive: this.draftActive(),
        dataFeeEnabled: feeEnabled,
        dataFeeAmount: feeEnabled ? this.draftFeeAmount().trim() || '0' : '0',
        dataFeeFrequency: feeEnabled ? this.draftFeeFrequency() : null,
        dataFeeNextChargeAt: feeEnabled && feeStart ? feeStart : undefined,
      });
      this.creating.set(false);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected startEdit(a: Account): void {
    this.editingId.set(a.id);
    this.editName.set(a.name);
    this.editBroker.set(a.broker ?? '');
    this.editCurrency.set(a.currency);
    this.editInitial.set(a.initialBalance);
    this.editInitialAt.set(isoToDateInput(a.initialBalanceAt));
    this.editActive.set(a.isActive);
    this.editFeeEnabled.set(a.dataFeeEnabled);
    this.editFeeAmount.set(a.dataFeeAmount);
    this.editFeeFrequency.set(a.dataFeeFrequency ?? 'MONTHLY');
    this.editFeeStart.set(a.dataFeeAmountSince ?? '');
    this.error.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(a: Account): Promise<void> {
    const name = this.editName().trim();
    if (!name) {
      this.error.set('El nombre es obligatorio');
      return;
    }
    try {
      const feeEnabled = this.editFeeEnabled();
      const feeStart = this.editFeeStart();
      await this.accounts.update(a.id, {
        name,
        broker: this.editBroker().trim() || null,
        currency: this.editCurrency().trim().toUpperCase(),
        initialBalance: this.editInitial().trim() || '0',
        initialBalanceAt: dateInputToIsoUtc(this.editInitialAt()),
        isActive: this.editActive(),
        dataFeeEnabled: feeEnabled,
        dataFeeAmount: feeEnabled ? this.editFeeAmount().trim() || '0' : '0',
        dataFeeFrequency: feeEnabled ? this.editFeeFrequency() : null,
        dataFeeNextChargeAt: feeEnabled && feeStart ? feeStart : undefined,
      });
      this.editingId.set(null);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  /**
   * Abre el historial de aportes y retiros de la cuenta. El diálogo recarga el
   * store al mutar, así que la tabla queda al día sin hacer nada aquí.
   * @param {Account} a - Cuenta cuyos movimientos se van a administrar
   * @returns {void}
   */
  protected openMovements(a: Account): void {
    this.dialog.open(CapitalMovementsDialogComponent, {
      data: a,
      hasBackdrop: true,
      backdropClass: ['bg-black/40'],
      panelClass: ['p-0'],
      autoFocus: 'first-tabbable',
    });
  }

  protected async removeAccount(a: Account): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar cuenta',
      message: `¿Eliminar la cuenta "${a.name}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      await this.accounts.remove(a.id);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  /**
   * True cuando un total decimal que llega como string es distinto de cero, para
   * no mostrar líneas de «+0.00 aportes».
   * @param {string} total - Total decimal serializado
   * @returns {boolean}
   */
  protected hasAmount(total: string): boolean {
    return Number(total) !== 0;
  }

  protected formatChargeDate(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    return d.toLocaleDateString('es', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      timeZone: 'UTC',
    });
  }
}
