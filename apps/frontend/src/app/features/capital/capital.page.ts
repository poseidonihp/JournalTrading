import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, Edit2, Save, X } from 'lucide-angular';
import {
  type Account,
  type DataFeeFrequency,
} from '@journal/shared-types';
import { AccountsStore } from '../../core/accounts/accounts.store';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';

const FREQUENCIES: DataFeeFrequency[] = ['MONTHLY', 'QUARTERLY', 'ANNUAL'];

const FREQ_LABELS: Record<DataFeeFrequency, string> = {
  MONTHLY: 'Mensual',
  QUARTERLY: 'Trimestral',
  ANNUAL: 'Anual',
};

@Component({
  selector: 'app-capital-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, FormsModule],
  templateUrl: './capital.page.html',
  styleUrl: './capital.page.scss',
})
export class CapitalPage {
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconEdit = Edit2;
  protected readonly iconSave = Save;
  protected readonly iconCancel = X;

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

  protected readonly accountList = this.accounts.accounts;
  protected readonly loading = this.accounts.loading;

  protected readonly creating = signal(false);
  protected readonly draftName = signal('');
  protected readonly draftBroker = signal('');
  protected readonly draftCurrency = signal('USD');
  protected readonly draftInitial = signal('0');
  protected readonly draftActive = signal(true);
  protected readonly draftFeeEnabled = signal(false);
  protected readonly draftFeeAmount = signal('0');
  protected readonly draftFeeFrequency = signal<DataFeeFrequency>('MONTHLY');

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editBroker = signal('');
  protected readonly editCurrency = signal('USD');
  protected readonly editInitial = signal('0');
  protected readonly editActive = signal(true);
  protected readonly editFeeEnabled = signal(false);
  protected readonly editFeeAmount = signal('0');
  protected readonly editFeeFrequency = signal<DataFeeFrequency>('MONTHLY');

  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.accounts.load();
  }

  protected openCreate(): void {
    this.error.set(null);
    this.draftName.set('');
    this.draftBroker.set('');
    this.draftCurrency.set('USD');
    this.draftInitial.set('0');
    this.draftActive.set(true);
    this.draftFeeEnabled.set(false);
    this.draftFeeAmount.set('0');
    this.draftFeeFrequency.set('MONTHLY');
    this.creating.set(true);
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
      await this.accounts.create({
        name,
        broker: this.draftBroker().trim() || null,
        currency: this.draftCurrency().trim().toUpperCase(),
        initialBalance: this.draftInitial().trim() || '0',
        isActive: this.draftActive(),
        dataFeeEnabled: feeEnabled,
        dataFeeAmount: feeEnabled ? this.draftFeeAmount().trim() || '0' : '0',
        dataFeeFrequency: feeEnabled ? this.draftFeeFrequency() : null,
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
    this.editActive.set(a.isActive);
    this.editFeeEnabled.set(a.dataFeeEnabled);
    this.editFeeAmount.set(a.dataFeeAmount);
    this.editFeeFrequency.set(a.dataFeeFrequency ?? 'MONTHLY');
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
      await this.accounts.update(a.id, {
        name,
        broker: this.editBroker().trim() || null,
        currency: this.editCurrency().trim().toUpperCase(),
        initialBalance: this.editInitial().trim() || '0',
        isActive: this.editActive(),
        dataFeeEnabled: feeEnabled,
        dataFeeAmount: feeEnabled ? this.editFeeAmount().trim() || '0' : '0',
        dataFeeFrequency: feeEnabled ? this.editFeeFrequency() : null,
      });
      this.editingId.set(null);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
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

  protected formatNextCharge(iso: string | null): string {
    if (!iso) {
      return '—';
    }
    const d = new Date(iso);
    return d.toLocaleDateString('es', { year: 'numeric', month: 'short', day: '2-digit' });
  }
}
