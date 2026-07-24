import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, ChevronLeft, ChevronRight, Save, Trash2, Loader } from 'lucide-angular';
import type { Session } from '@journal/shared-types';
import { SessionsStore } from '../../core/sessions/sessions.store';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function monthFromDate(date: string): string {
  return date.slice(0, 7);
}

function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

@Component({
  selector: 'app-notebook-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, FormsModule],
  templateUrl: './notebook.page.html',
  styleUrl: './notebook.page.scss',
})
export class NotebookPage {
  protected readonly iconLeft = ChevronLeft;
  protected readonly iconRight = ChevronRight;
  protected readonly iconSave = Save;
  protected readonly iconTrash = Trash2;
  protected readonly iconLoader = Loader;

  protected readonly store = inject(SessionsStore);
  private readonly confirm = inject(ConfirmService);
  protected readonly sessions = this.store.sessions;
  protected readonly loading = this.store.loading;

  protected readonly selectedDate = signal<string>(todayIso());
  protected readonly month = signal<string>(monthFromDate(todayIso()));
  protected readonly notes = signal<string>('');
  protected readonly mood = signal<string>('');
  protected readonly saving = signal<boolean>(false);
  protected readonly error = signal<string | null>(null);
  protected readonly justSaved = signal<boolean>(false);

  protected readonly currentSession = computed<Session | null>(() => {
    const d = this.selectedDate();
    return this.sessions().find(s => s.date === d) ?? null;
  });

  protected readonly monthLabel = computed(() => {
    const [y, m] = this.month().split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-CO', {
      month: 'long',
      year: 'numeric',
    });
  });

  constructor() {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    await this.store.loadMonth(this.month());
    this.syncFormFromSelection();
  }

  protected async prevMonth(): Promise<void> {
    this.month.update(m => shiftMonth(m, -1));
    await this.store.loadMonth(this.month());
  }

  protected async nextMonth(): Promise<void> {
    this.month.update(m => shiftMonth(m, 1));
    await this.store.loadMonth(this.month());
  }

  protected selectDate(date: string): void {
    this.selectedDate.set(date);
    if (monthFromDate(date) !== this.month()) {
      this.month.set(monthFromDate(date));
      void this.store.loadMonth(this.month());
    }
    this.syncFormFromSelection();
  }

  protected onDateChange(value: string): void {
    if (!value) return;
    this.selectDate(value);
  }

  private syncFormFromSelection(): void {
    const s = this.currentSession();
    this.notes.set(s?.notes ?? '');
    this.mood.set(s?.mood ?? '');
    this.justSaved.set(false);
  }

  protected async save(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.store.upsert({
        date: this.selectedDate(),
        notes: this.notes(),
        mood: this.mood() || null,
      });
      this.justSaved.set(true);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    } finally {
      this.saving.set(false);
    }
  }

  protected async deleteCurrent(): Promise<void> {
    const s = this.currentSession();
    if (!s) return;
    const ok = await this.confirm.ask({
      title: 'Eliminar entrada',
      message: `¿Eliminar la entrada del ${s.date}?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await this.store.remove(s.id);
      this.notes.set('');
      this.mood.set('');
      this.justSaved.set(false);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }
}
