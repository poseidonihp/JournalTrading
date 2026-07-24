import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, Plus, Trash2, Edit2 } from 'lucide-angular';
import type { TradeType } from '@journal/shared-types';
import { TradeTypesStore } from '../../core/trade-types/trade-types.store';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';

const DEFAULT_COLORS = [
  '#6366f1',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#0ea5e9',
  '#a855f7',
  '#14b8a6',
  '#f43f5e',
];

@Component({
  selector: 'app-trade-types-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, FormsModule],
  templateUrl: './trade-types.page.html',
  styleUrl: './trade-types.page.scss',
})
export class TradeTypesPage {
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconEdit = Edit2;
  protected readonly defaultColors = DEFAULT_COLORS;

  protected readonly store = inject(TradeTypesStore);
  private readonly confirm = inject(ConfirmService);
  protected readonly types = this.store.types;
  protected readonly loading = this.store.loading;

  protected readonly draftName = signal('');
  protected readonly draftColor = signal(DEFAULT_COLORS[0]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editColor = signal('');
  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.store.load();
  }

  protected async addType(): Promise<void> {
    const name = this.draftName().trim();
    if (!name) return;
    this.error.set(null);
    try {
      await this.store.create({ name, color: this.draftColor() });
      this.draftName.set('');
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected startEdit(t: TradeType): void {
    this.editingId.set(t.id);
    this.editName.set(t.name);
    this.editColor.set(t.color);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  protected async saveEdit(t: TradeType): Promise<void> {
    const name = this.editName().trim();
    if (!name) return;
    this.error.set(null);
    try {
      await this.store.update(t.id, { name, color: this.editColor() });
      this.editingId.set(null);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected async removeType(t: TradeType): Promise<void> {
    const ok = await this.confirm.ask({
      title: 'Eliminar tipo',
      message: `¿Eliminar el tipo "${t.name}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    this.error.set(null);
    try {
      await this.store.remove(t.id);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }
}
