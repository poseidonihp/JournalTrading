import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { LucideAngularModule, Plus, Trash2, Edit2, X, Save } from 'lucide-angular';
import type { User } from '@journal/shared-types';
import { UsersStore } from '../../core/users/users.store';
import { AuthStore } from '../../core/auth/auth.store';
import { ApiClient } from '../../core/http/api.client';
import { ConfirmService } from '../../core/confirm/confirm.service';

const MIN_PASSWORD_LENGTH = 8;

@Component({
  selector: 'app-users-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LucideAngularModule, FormsModule, DatePipe],
  templateUrl: './users.page.html',
  styleUrl: './users.page.scss',
})
export class UsersPage {
  protected readonly iconPlus = Plus;
  protected readonly iconTrash = Trash2;
  protected readonly iconEdit = Edit2;
  protected readonly iconCancel = X;
  protected readonly iconSave = Save;

  private readonly users = inject(UsersStore);
  private readonly auth = inject(AuthStore);
  private readonly confirm = inject(ConfirmService);

  protected readonly userList = this.users.users;
  protected readonly loading = this.users.loading;
  protected readonly currentUser = this.auth.user;

  protected readonly creating = signal(false);
  protected readonly draftEmail = signal('');
  protected readonly draftDisplayName = signal('');
  protected readonly draftPassword = signal('');
  protected readonly draftTimezone = signal('America/Bogota');
  protected readonly draftLocale = signal('es');

  protected readonly editingId = signal<string | null>(null);
  protected readonly editEmail = signal('');
  protected readonly editDisplayName = signal('');
  protected readonly editPassword = signal('');
  protected readonly editTimezone = signal('');
  protected readonly editLocale = signal('');

  protected readonly error = signal<string | null>(null);

  constructor() {
    void this.users.load();
  }

  protected openCreate(): void {
    this.error.set(null);
    this.draftEmail.set('');
    this.draftDisplayName.set('');
    this.draftPassword.set('');
    this.draftTimezone.set('America/Bogota');
    this.draftLocale.set('es');
    this.creating.set(true);
  }

  protected cancelCreate(): void {
    this.creating.set(false);
    this.error.set(null);
  }

  protected async submitCreate(): Promise<void> {
    const email = this.draftEmail().trim();
    const displayName = this.draftDisplayName().trim();
    const password = this.draftPassword();
    if (!email || !displayName) {
      this.error.set('Email y nombre son obligatorios');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(`El password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    this.error.set(null);
    try {
      await this.users.create({
        email,
        displayName,
        password,
        timezone: this.draftTimezone().trim() || undefined,
        locale: this.draftLocale().trim() || undefined,
      });
      this.creating.set(false);
      this.draftPassword.set('');
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected startEdit(u: User): void {
    this.editingId.set(u.id);
    this.editEmail.set(u.email);
    this.editDisplayName.set(u.displayName);
    this.editPassword.set('');
    this.editTimezone.set(u.timezone);
    this.editLocale.set(u.locale);
    this.error.set(null);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.editPassword.set('');
  }

  protected async saveEdit(u: User): Promise<void> {
    const email = this.editEmail().trim();
    const displayName = this.editDisplayName().trim();
    const password = this.editPassword();
    if (!email || !displayName) {
      this.error.set('Email y nombre son obligatorios');
      return;
    }
    if (password !== '' && password.length < MIN_PASSWORD_LENGTH) {
      this.error.set(`El password debe tener al menos ${MIN_PASSWORD_LENGTH} caracteres`);
      return;
    }
    this.error.set(null);
    try {
      await this.users.update(u.id, {
        email,
        displayName,
        timezone: this.editTimezone().trim() || undefined,
        locale: this.editLocale().trim() || undefined,
        password: password === '' ? undefined : password,
      });
      this.editingId.set(null);
      this.editPassword.set('');
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected async removeUser(u: User): Promise<void> {
    const current = this.currentUser();
    if (current && current.id === u.id) {
      this.error.set('No puedes eliminar tu propio usuario');
      return;
    }
    const ok = await this.confirm.ask({
      title: 'Eliminar usuario',
      message: `¿Eliminar al usuario "${u.email}"?`,
      confirmLabel: 'Eliminar',
      tone: 'danger',
    });
    if (!ok) {
      return;
    }
    try {
      await this.users.remove(u.id);
    } catch (e) {
      this.error.set(ApiClient.messageFromError(e));
    }
  }

  protected isSelf(u: User): boolean {
    const current = this.currentUser();
    return current !== null && current.id === u.id;
  }
}
