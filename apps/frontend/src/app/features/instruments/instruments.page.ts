import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, Edit2, Save, X } from 'lucide-angular';
import type { Instrument } from '@journal/shared-types';
import { InstrumentsStore } from '../../core/instruments/instruments.store';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';

type Category = 'FUTURE' | 'CFD';

@Component({
  selector: 'app-instruments-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, FormsModule],
  templateUrl: './instruments.page.html',
  styleUrl: './instruments.page.scss',
})
export class InstrumentsPage {
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconEdit = Edit2;
  protected readonly iconSave = Save;
  protected readonly iconCancel = X;

  protected readonly categories: readonly Category[] = ['FUTURE', 'CFD'];

  private readonly instruments = inject(InstrumentsStore);
  private readonly confirm = inject(ConfirmService);

  protected readonly list = this.instruments.list;
  protected readonly loading = this.instruments.loading;

  protected readonly creating = signal(false);
  protected readonly draftSymbol = signal('');
  protected readonly draftName = signal('');
  protected readonly draftCategory = signal<Category>('FUTURE');
  protected readonly draftPointValue = signal('1');
  protected readonly draftFee = signal('0');
  protected readonly draftTick = signal('0.25');
  protected readonly draftCurrency = signal('USD');

  protected readonly editingId = signal<string | null>(null);
  protected readonly editSymbol = signal('');
  protected readonly editName = signal('');
  protected readonly editCategory = signal<Category>('FUTURE');
  protected readonly editPointValue = signal('1');
  protected readonly editFee = signal('0');
  protected readonly editTick = signal('0.25');
  protected readonly editCurrency = signal('USD');

  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.instruments.load(true);
  }

  protected openCreate(): void {
    this.error.set(null);
    this.draftSymbol.set('');
    this.draftName.set('');
    this.draftCategory.set('FUTURE');
    this.draftPointValue.set('1');
    this.draftFee.set('0');
    this.draftTick.set('0.25');
    this.draftCurrency.set('USD');
    this.creating.set(true);
  }

  protected cancelCreate(): void {
    this.creating.set(false);
  }

  protected async submitCreate(): Promise<void> {
    const symbol = this.draftSymbol().trim().toUpperCase();
    const name = this.draftName().trim();
    if (!symbol || !name) {
      this.error.set('Símbolo y nombre son obligatorios');
      return;
    }
    try {
      await this.instruments.create({
        symbol,
        name,
        category: this.draftCategory(),
        pointValue: this.draftPointValue().trim() || '0',
        defaultCommissionPerContract: this.draftFee().trim() || '0',
        tickSize: this.draftTick().trim() || '0',
        currency: this.draftCurrency().trim().toUpperCase(),
      });
      this.creating.set(false);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected startEdit(i: Instrument): void {
    this.editingId.set(i.id);
    this.editSymbol.set(i.symbol);
    this.editName.set(i.name);
    this.editCategory.set(i.category);
    this.editPointValue.set(i.pointValue);
    this.editFee.set(i.defaultCommissionPerContract);
    this.editTick.set(i.tickSize);
    this.editCurrency.set(i.currency);
    this.error.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(i: Instrument): Promise<void> {
    const symbol = this.editSymbol().trim().toUpperCase();
    const name = this.editName().trim();
    if (!symbol || !name) {
      this.error.set('Símbolo y nombre son obligatorios');
      return;
    }
    try {
      await this.instruments.update(i.id, {
        symbol,
        name,
        category: this.editCategory(),
        pointValue: this.editPointValue().trim() || '0',
        defaultCommissionPerContract: this.editFee().trim() || '0',
        tickSize: this.editTick().trim() || '0',
        currency: this.editCurrency().trim().toUpperCase(),
      });
      this.editingId.set(null);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected async remove(i: Instrument): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar instrumento',
      message: `¿Eliminar el instrumento "${i.symbol}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      await this.instruments.remove(i.id);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }
}
